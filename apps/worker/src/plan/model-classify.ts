import type { DocumentClassificationV1 } from "@hiveforyou/contracts/extraction/v1";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackManifestV2 } from "@hiveforyou/contracts/domain-packs/v2";
import type { NormalizedDomainPackManifest } from "@hiveforyou/core";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import {
  AMBIGUITY_MULTIPLE_DOMAINS,
  classificationIsInconclusive,
  classifyDocument,
  type ClassifyDocumentInputV1,
} from "./classify.js";
import { PlanningError } from "./errors.js";
import { emitPlanningLog } from "./observability.js";
import { excerptPages } from "./page-excerpt.js";
import { EXACT_MATCH_THRESHOLD, PARTIAL_DOMAIN_THRESHOLD } from "./thresholds.js";
import { createLiteLlmReasoningClient } from "../reasoning/litellm-client.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

const CLASSIFY_SYSTEM_PROMPT = [
  "Classify the document against the supplied declarative pack candidates.",
  "Return JSON with domain_id, document_type_id, pack_id, score, classification_quality,",
  "ambiguity_notes, and detected_sections.",
  "classification_quality must be high, medium, or low.",
  "Use null for domain_id, document_type_id, and pack_id when no candidate fits or signals conflict.",
  "Do not invent pack or document type ids.",
  "detected_sections entries have label, page_start, and page_end from the supplied pages.",
  "ambiguity_notes must not quote document text.",
].join(" ");

type ModelClassificationV1 = {
  domain_id: string | null;
  document_type_id: string | null;
  pack_id: string | null;
  score: number;
  classification_quality: DocumentClassificationV1["classification_quality"];
  ambiguity_notes: string[];
  detected_sections: DocumentClassificationV1["detected_sections"];
};

function invalidClassification(reason: string): PlanningError {
  return new PlanningError(
    ErrorCode.MODEL_OUTPUT_INVALID,
    "Model returned an invalid document classification.",
    { reason },
  );
}

function parseClassification(
  raw: unknown,
  pageCount: number,
): ModelClassificationV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalidClassification("classification_response_invalid");
  }
  const body = raw as Record<string, unknown>;
  const domain_id = nullableId(body.domain_id, "domain_id");
  const document_type_id = nullableId(body.document_type_id, "document_type_id");
  const pack_id = nullableId(body.pack_id, "pack_id");
  if (typeof body.score !== "number" || !Number.isFinite(body.score) || body.score < 0 || body.score > 1) {
    throw invalidClassification("classification_score");
  }
  if (
    body.classification_quality !== "high" &&
    body.classification_quality !== "medium" &&
    body.classification_quality !== "low"
  ) {
    throw invalidClassification("classification_quality");
  }
  const ambiguity_notes = normalizeAmbiguityNotes(body.ambiguity_notes);
  if (!Array.isArray(body.detected_sections)) {
    throw invalidClassification("detected_sections");
  }
  if (body.detected_sections.length > 12) {
    throw invalidClassification("detected_sections");
  }
  const detected_sections = body.detected_sections.map((section) => {
    if (!section || typeof section !== "object") {
      throw invalidClassification("detected_sections");
    }
    const row = section as Record<string, unknown>;
    if (typeof row.label !== "string" || !row.label.trim() || row.label.length > 80) {
      throw invalidClassification("detected_sections");
    }
    if (!Number.isInteger(row.page_start) || !Number.isInteger(row.page_end)) {
      throw invalidClassification("section_page_out_of_range");
    }
    const page_start = row.page_start as number;
    const page_end = row.page_end as number;
    if (
      page_start < 1 ||
      page_end < page_start ||
      page_end > pageCount
    ) {
      throw invalidClassification("section_page_out_of_range");
    }
    return { label: row.label.trim(), page_start, page_end };
  });

  return {
    domain_id,
    document_type_id,
    pack_id,
    score: body.score,
    classification_quality: body.classification_quality,
    ambiguity_notes,
    detected_sections,
  };
}

function normalizeAmbiguityNotes(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    throw invalidClassification("ambiguity_notes");
  }
  if (!Array.isArray(value)) {
    throw invalidClassification("ambiguity_notes");
  }
  const ambiguity_notes: string[] = [];
  for (const note of value.slice(0, 8)) {
    if (typeof note !== "string") {
      throw invalidClassification("ambiguity_notes");
    }
    const trimmed = note.trim();
    if (!trimmed) {
      continue;
    }
    ambiguity_notes.push(trimmed.slice(0, 200));
  }
  return ambiguity_notes;
}

function nullableId(value: unknown, reason: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw invalidClassification(reason);
  }
  return value.trim();
}

type PackLikeForModelClassify =
  | DomainPackManifestV1
  | DomainPackManifestV2
  | NormalizedDomainPackManifest;

function findDocumentType(
  packs: PackLikeForModelClassify[],
  parsed: ModelClassificationV1,
): { pack_id: string; domain_id: string; document_type_id: string } | null {
  if (!parsed.pack_id || !parsed.domain_id || !parsed.document_type_id) {
    return null;
  }
  for (const manifest of packs) {
    if (manifest.pack_id !== parsed.pack_id) {
      continue;
    }
    const match = manifest.document_types.find(
      (entry) =>
        entry.document_type_id === parsed.document_type_id &&
        entry.domain_id === parsed.domain_id,
    );
    if (match) {
      return {
        pack_id: manifest.pack_id,
        domain_id: match.domain_id,
        document_type_id: match.document_type_id,
      };
    }
  }
  return null;
}

function findDomain(
  packs: PackLikeForModelClassify[],
  parsed: ModelClassificationV1,
): { pack_id: string; domain_id: string } | null {
  if (!parsed.pack_id || !parsed.domain_id || parsed.document_type_id) {
    return null;
  }
  for (const manifest of packs) {
    if (manifest.pack_id !== parsed.pack_id) {
      continue;
    }
    const match = manifest.domains.find((entry) => entry.domain_id === parsed.domain_id);
    if (match) {
      return { pack_id: manifest.pack_id, domain_id: match.domain_id };
    }
  }
  return null;
}

function dedupeNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const note of notes) {
    if (seen.has(note)) {
      continue;
    }
    seen.add(note);
    result.push(note);
    if (result.length === 8) {
      break;
    }
  }
  return result;
}

function applyModelClassification(
  base: DocumentClassificationV1,
  parsed: ModelClassificationV1,
  packs: (DomainPackManifestV1 | DomainPackManifestV2 | NormalizedDomainPackManifest)[],
): DocumentClassificationV1 {
  const crossDomain = base.ambiguity_notes.includes(AMBIGUITY_MULTIPLE_DOMAINS);
  const matchedType = findDocumentType(packs, parsed);
  const matchedDomain = findDomain(packs, parsed);
  const proposedIds = Boolean(parsed.domain_id || parsed.document_type_id || parsed.pack_id);
  const unmatchedNote =
    proposedIds && !matchedType && !matchedDomain
      ? ["Model classification did not match a loaded pack document type."]
      : [];
  const ambiguity_notes = dedupeNotes([
    ...base.ambiguity_notes,
    ...parsed.ambiguity_notes,
    ...unmatchedNote,
  ]);

  if (crossDomain) {
    return {
      ...base,
      chosen: {
        domain_id: null,
        document_type_id: null,
        pack_id: null,
        score: base.chosen.score,
      },
      ambiguity_notes,
      classification_quality: "low",
      detected_sections: parsed.detected_sections,
    };
  }

  if (
    !crossDomain &&
    matchedType &&
    parsed.classification_quality === "high" &&
    parsed.ambiguity_notes.length === 0 &&
    parsed.score >= EXACT_MATCH_THRESHOLD
  ) {
    const chosen = {
      domain_id: matchedType.domain_id,
      document_type_id: matchedType.document_type_id,
      pack_id: matchedType.pack_id,
      score: parsed.score,
    };
    const rest = base.candidates.filter(
      (candidate) =>
        !(
          candidate.pack_id === chosen.pack_id &&
          candidate.document_type_id === chosen.document_type_id
        ),
    );
    return {
      ...base,
      chosen,
      candidates: [chosen, ...rest].slice(0, 5),
      ambiguity_notes,
      classification_quality: "high",
      detected_sections: parsed.detected_sections,
    };
  }

  if (
    !crossDomain &&
    matchedDomain &&
    parsed.classification_quality !== "low" &&
    parsed.score >= PARTIAL_DOMAIN_THRESHOLD
  ) {
    return {
      ...base,
      chosen: {
        domain_id: matchedDomain.domain_id,
        document_type_id: null,
        pack_id: matchedDomain.pack_id,
        score: parsed.score,
      },
      ambiguity_notes,
      classification_quality: parsed.classification_quality,
      detected_sections: parsed.detected_sections,
    };
  }

  return {
    ...base,
    ambiguity_notes,
    detected_sections: parsed.detected_sections,
  };
}

function requireClient(reasoning: ReasoningJsonClient | undefined): ReasoningJsonClient {
  if (reasoning) {
    return reasoning;
  }
  return createLiteLlmReasoningClient();
}

export async function resolveDocumentClassification(
  input: ClassifyDocumentInputV1,
  reasoning?: ReasoningJsonClient,
): Promise<DocumentClassificationV1> {
  const started = Date.now();
  let modelAlias: string | null = null;
  try {
    const base = classifyDocument(input);
    if (!classificationIsInconclusive(base)) {
      emitPlanningLog({
        level: "info",
        stage: "classify",
        correlation_id: input.correlation_id ?? null,
        study_run_id: input.study_run_id ?? null,
        source_document_id: input.source_document_id,
        classification_quality: base.classification_quality,
        domain_id: base.chosen.domain_id,
        document_type_id: base.chosen.document_type_id,
        ambiguity_count: base.ambiguity_notes.length,
        model_alias: null,
        duration_ms: Date.now() - started,
      });
      return base;
    }

    const client = requireClient(reasoning);
    const result = await client.completeJson({
      task: "classify_document",
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      correlationId: input.correlation_id,
      userPayload: {
        filename: input.filename,
        domain_hint: input.domain_hint,
        pages: excerptPages(input.pages),
        deterministic: {
          chosen: base.chosen,
          candidates: base.candidates,
          ambiguity_notes: base.ambiguity_notes,
          classification_quality: base.classification_quality,
        },
      },
    });
    modelAlias = result.alias;
    const parsed = parseClassification(result.parsed, input.pages.length);
    const resolved = applyModelClassification(base, parsed, input.packs);
    emitPlanningLog({
      level: "info",
      stage: "classify",
      correlation_id: input.correlation_id ?? null,
      study_run_id: input.study_run_id ?? null,
      source_document_id: input.source_document_id,
      classification_quality: resolved.classification_quality,
      domain_id: resolved.chosen.domain_id,
      document_type_id: resolved.chosen.document_type_id,
      ambiguity_count: resolved.ambiguity_notes.length,
      model_alias: modelAlias,
      duration_ms: Date.now() - started,
    });
    return resolved;
  } catch (error) {
    const planning = error instanceof PlanningError ? error : null;
    emitPlanningLog({
      level: "error",
      stage: "classify",
      correlation_id: input.correlation_id ?? null,
      study_run_id: input.study_run_id ?? null,
      source_document_id: input.source_document_id,
      model_alias:
        modelAlias ??
        (typeof planning?.diagnostics.alias === "string" ? planning.diagnostics.alias : null),
      duration_ms: Date.now() - started,
      error_code: planning?.errorCode ?? ErrorCode.EXTRACTION_FAILED,
      retryable: planning?.retryable ?? false,
      message_safe: planning?.message ?? "Document classification failed.",
      failure_reason:
        typeof planning?.diagnostics.reason === "string"
          ? planning.diagnostics.reason
          : "unexpected",
    });
    throw error;
  }
}
