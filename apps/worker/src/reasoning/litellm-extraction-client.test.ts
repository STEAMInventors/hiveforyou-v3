import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { PACK_EXTRACTION_OUTPUT_VERSION } from "@hiveforyou/contracts/pack-extraction/v1";
import { normalizeDomainPackManifest, parsePackManifest } from "@hiveforyou/core";

import {
  buildPackExtractionUserMessage,
  compilePackSystemPrompt,
  extractPackDocument,
  serializePackExtractionUserMessage,
} from "../pack-extraction/index.js";
import { createLiteLlmExtractionClient } from "./litellm-extraction-client.js";

const configured = {
  LITELLM_BASE_URL: "http://litellm.test",
  LITELLM_API_KEY: "test-key",
  WORKER_P2_EXTRACTION_LITELLM_ALIAS: "hive-p2-extraction",
} as NodeJS.ProcessEnv;

const repoRoot = join(process.cwd(), "../..");
const iep210Path = join(repoRoot, "domain-packs/iep/2.1.0/manifest.json");

function loadCompiledIep210() {
  const bytes = readFileSync(iep210Path, "utf8");
  const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(bytes)));
  const compiled = compilePackSystemPrompt(manifest, { manifestBytes: bytes, allowDraft: true });
  return { manifest, compiled };
}

function minimalValidModelOutput(promptDigest: string, sourceRefId: string, quote: string) {
  return {
    contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
    prompt_digest: promptDigest,
    source_ref_id: sourceRefId,
    classification: {
      status: "CLASSIFIED",
      primary_document_type_id: "iep.referral",
      candidates: [
        {
          document_type_id: "iep.referral",
          rank: 1,
          evidence: [{ page_number: 1, exact_quote: quote }],
        },
      ],
    },
    records: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiteLLM pack extraction client", () => {
  it("requires WORKER_P2_EXTRACTION_LITELLM_ALIAS", () => {
    expect(() =>
      createLiteLlmExtractionClient({
        LITELLM_BASE_URL: "http://litellm.test",
        LITELLM_API_KEY: "test-key",
      } as NodeJS.ProcessEnv),
    ).toThrow(expect.objectContaining({ errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE }));
  });

  it("sends system content block, user JSON, metadata, and full system bytes", async () => {
    const { compiled } = loadCompiledIep210();
    const userJson = serializePackExtractionUserMessage(
      buildPackExtractionUserMessage({
        prompt_digest: compiled.prompt_digest,
        source_ref_id: "src-a",
        source_sha256: "a".repeat(64),
        read_fingerprint: "fp-a",
        mime_family: "pdf",
        page_count: 1,
        window: { page_start: 1, page_end: 1, is_partial: false },
        pages_meta: [{ page_number: 1, extraction_method: "native_text", quality: "good" }],
        pages: [
          {
            page_number: 1,
            text: "<<<PAGE 1 BEGIN>>>\nDOC_ALPHA\n<<<PAGE 1 END>>>",
          },
        ],
      }),
    );

    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("hive-p2-extraction");
      expect(body.metadata.task).toBe("extract_pack_document");
      expect(body.metadata.prompt_digest).toBe(compiled.prompt_digest);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toEqual([
        { type: "text", text: compiled.system_text },
      ]);
      expect(body.messages[1]).toEqual({ role: "user", content: userJson });
      expect(body.messages[0].content[0].text).toBe(compiled.system_text);
      expect(body.messages[0].content[0].text.length).toBe(compiled.system_text.length);
      return {
        status: 200,
        ok: true,
        async json() {
          return {
            id: "chatcmpl-test",
            model: "anthropic/claude-test",
            usage: { prompt_tokens: 12000, completion_tokens: 400 },
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify(
                    minimalValidModelOutput(compiled.prompt_digest, "src-a", "DOC_ALPHA"),
                  ),
                },
              },
            ],
          };
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createLiteLlmExtractionClient(configured);
    const result = await extractPackDocument(client, {
      systemPrompt: compiled.system_text,
      userMessageJson: userJson,
      prompt_digest: compiled.prompt_digest,
      pack_id: compiled.pack_id,
      pack_version: compiled.pack_version,
      correlationId: "corr-1",
    });

    expect(result.output.classification.status).toBe("CLASSIFIED");
    expect(result.diagnostics.cache_status).toBe("NOT_REPORTED");
    expect(result.diagnostics.prefix_caching_verified).toBe(false);
    expect(result.diagnostics.system_prompt_byte_length).toBe(compiled.prompt_byte_length);
  });

  it("uses identical system prefix bytes for two different documents", async () => {
    const { compiled } = loadCompiledIep210();
    const capturedSystemTexts: string[] = [];

    const userA = serializePackExtractionUserMessage(
      buildPackExtractionUserMessage({
        prompt_digest: compiled.prompt_digest,
        source_ref_id: "src-a",
        source_sha256: "a".repeat(64),
        read_fingerprint: "fp-a",
        mime_family: "pdf",
        page_count: 1,
        window: { page_start: 1, page_end: 1, is_partial: false },
        pages_meta: [{ page_number: 1, extraction_method: "native_text", quality: "good" }],
        pages: [
          {
            page_number: 1,
            text: "<<<PAGE 1 BEGIN>>>\nDOC_ALPHA\n<<<PAGE 1 END>>>",
          },
        ],
      }),
    );
    const userB = serializePackExtractionUserMessage(
      buildPackExtractionUserMessage({
        prompt_digest: compiled.prompt_digest,
        source_ref_id: "src-b",
        source_sha256: "b".repeat(64),
        read_fingerprint: "fp-b",
        mime_family: "pdf",
        page_count: 1,
        window: { page_start: 1, page_end: 1, is_partial: false },
        pages_meta: [{ page_number: 1, extraction_method: "native_text", quality: "good" }],
        pages: [
          {
            page_number: 1,
            text: "<<<PAGE 1 BEGIN>>>\nDOC_BETA\n<<<PAGE 1 END>>>",
          },
        ],
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        capturedSystemTexts.push(body.messages[0].content[0].text);
        const userJson = body.messages[1].content as string;
        const sourceRefId = userJson.includes("src-a") ? "src-a" : "src-b";
        const quote = userJson.includes("DOC_ALPHA") ? "DOC_ALPHA" : "DOC_BETA";
        return {
          status: 200,
          ok: true,
          async json() {
            return {
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify(
                      minimalValidModelOutput(compiled.prompt_digest, sourceRefId, quote),
                    ),
                  },
                },
              ],
            };
          },
        };
      }),
    );

    const client = createLiteLlmExtractionClient(configured);
    await extractPackDocument(client, {
      systemPrompt: compiled.system_text,
      userMessageJson: userA,
      prompt_digest: compiled.prompt_digest,
      pack_id: compiled.pack_id,
      pack_version: compiled.pack_version,
    });
    await extractPackDocument(client, {
      systemPrompt: compiled.system_text,
      userMessageJson: userB,
      prompt_digest: compiled.prompt_digest,
      pack_id: compiled.pack_id,
      pack_version: compiled.pack_version,
    });

    expect(capturedSystemTexts).toHaveLength(2);
    expect(capturedSystemTexts[0]).toBe(capturedSystemTexts[1]);
    expect(capturedSystemTexts[0]).toBe(compiled.system_text);
  });

  it("maps malformed JSON from the model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return { choices: [{ message: { content: "not-json" } }] };
        },
      })),
    );
    const client = createLiteLlmExtractionClient(configured);
    await expect(
      client.extractPackDocument({
        systemPrompt: "sys",
        userMessageJson: "{}",
        prompt_digest: "sha256:" + "a".repeat(64),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "message_content_invalid_json" },
    });
  });

  it("maps gateway 503 to MODEL_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 503,
        ok: false,
        async json() {
          return { error: { message: "SECRET" } };
        },
      })),
    );
    const client = createLiteLlmExtractionClient(configured);
    await expect(
      client.extractPackDocument({
        systemPrompt: "sys",
        userMessageJson: "{}",
        prompt_digest: "sha256:" + "a".repeat(64),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MODEL_UNAVAILABLE });
  });

  it("maps timeouts without retrying", async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createLiteLlmExtractionClient(configured);
    await expect(
      client.extractPackDocument({
        systemPrompt: "sys",
        userMessageJson: "{}",
        prompt_digest: "sha256:" + "a".repeat(64),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MODEL_TIMEOUT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps context-limit rejection on 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 400,
        ok: false,
        async json() {
          return { error: { type: "context_length_exceeded", code: "invalid_request_error" } };
        },
      })),
    );
    const client = createLiteLlmExtractionClient(configured);
    await expect(
      client.extractPackDocument({
        systemPrompt: "sys",
        userMessageJson: "{}",
        prompt_digest: "sha256:" + "a".repeat(64),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "context_limit_rejected" },
    });
  });

  it("parses cache usage when the gateway reports cached tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            usage: {
              prompt_tokens: 9000,
              completion_tokens: 100,
              prompt_tokens_details: { cached_tokens: 8500 },
            },
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
                    prompt_digest: "sha256:" + "a".repeat(64),
                    source_ref_id: "src-a",
                    classification: { status: "UNRECOGNIZED" },
                    records: [],
                  }),
                },
              },
            ],
          };
        },
      })),
    );
    const client = createLiteLlmExtractionClient(configured);
    const result = await client.extractPackDocument({
      systemPrompt: "sys",
      userMessageJson: "{}",
      prompt_digest: "sha256:" + "a".repeat(64),
    });
    expect(result.usage.cache_status).toBe("HIT");
    expect(result.usage.cached_input_tokens).toBe(8500);
  });

  it("rejects output that fails pack-extraction-output@1 parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify({ contract_version: "wrong@9" }) },
              },
            ],
          };
        },
      })),
    );
    const client = createLiteLlmExtractionClient(configured);
    await expect(
      extractPackDocument(client, {
        systemPrompt: "sys",
        userMessageJson: "{}",
        prompt_digest: "sha256:" + "a".repeat(64),
        pack_id: "iep",
        pack_version: "2.1.0",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "output_contract_invalid" },
    });
  });
});
