import {
  READER_DOCUMENT_READ_VERSION,
  READER_EXTRACT_CANDIDATES_VERSION,
  READER_HTTP_HEADERS,
  type ReaderExtractCandidatesRequestV1,
  type ReaderExtractCandidatesResponseV1,
  type ReaderReadDocumentRequestV1,
  type ReaderReadDocumentResponseV1,
} from "@hiveforyou/contracts/reader/v1";
import type { ExtractionSchemaV1 } from "@hiveforyou/contracts/extraction/v1";
import type { ReaderReadDocumentSourceV1 } from "@hiveforyou/contracts/reader/v1";

export class ReaderClientError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly errorCode: string,
  ) {
    super(message);
    this.name = "ReaderClientError";
  }
}

export type ReaderClient = {
  readDocument(input: {
    source: ReaderReadDocumentSourceV1;
    correlationId: string;
    studyRunId: string;
    extractionBatchId: string;
  }): Promise<ReaderReadDocumentResponseV1>;
  extractCandidates(input: {
    source: ReaderReadDocumentSourceV1;
    pages: ReaderReadDocumentResponseV1["pages"];
    readFingerprint: string;
    schema: ExtractionSchemaV1;
    correlationId: string;
    studyRunId: string;
    extractionBatchId: string;
  }): Promise<ReaderExtractCandidatesResponseV1>;
};

function readerBaseUrl(): string {
  const base = process.env.READER_BASE_URL?.trim();
  if (!base) {
    throw new ReaderClientError(
      "Reader is not configured.",
      true,
      "DEPENDENCY_UNAVAILABLE",
    );
  }
  return base.replace(/\/$/, "");
}

function readerToken(): string {
  const token = process.env.READER_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new ReaderClientError(
      "Reader authentication is not configured.",
      true,
      "DEPENDENCY_UNAVAILABLE",
    );
  }
  return token;
}

function timeoutMs(): number {
  const raw = process.env.WORKER_READER_HTTP_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 120_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

async function postJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(`${readerBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readerToken()}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json()) as T & {
      error_code?: string;
      message_safe?: string;
      retryable?: boolean;
    };
    if (!response.ok) {
      const retryable =
        response.status >= 500 ||
        response.status === 504 ||
        payload.retryable === true;
      throw new ReaderClientError(
        payload.message_safe ?? "Reader request failed.",
        retryable,
        payload.error_code ?? "DEPENDENCY_UNAVAILABLE",
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ReaderClientError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ReaderClientError("Reader request timed out.", true, "MODEL_TIMEOUT");
    }
    throw new ReaderClientError("Reader is unavailable.", true, "DEPENDENCY_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

export function createReaderClient(): ReaderClient {
  return {
    async readDocument(input) {
      const body: ReaderReadDocumentRequestV1 = {
        contract_version: READER_DOCUMENT_READ_VERSION,
        source: input.source,
        extraction_schema: null,
      };
      return postJson<ReaderReadDocumentResponseV1>("/v1/read-document", body, {
        [READER_HTTP_HEADERS.CORRELATION_ID]: input.correlationId,
        [READER_HTTP_HEADERS.STUDY_RUN_ID]: input.studyRunId,
        [READER_HTTP_HEADERS.EXTRACTION_BATCH_ID]: input.extractionBatchId,
      });
    },
    async extractCandidates(input) {
      const body: ReaderExtractCandidatesRequestV1 = {
        contract_version: READER_EXTRACT_CANDIDATES_VERSION,
        source: input.source,
        pages: input.pages,
        read_fingerprint: input.readFingerprint,
        extraction_schema: input.schema,
      };
      return postJson<ReaderExtractCandidatesResponseV1>("/v1/extract-candidates", body, {
        [READER_HTTP_HEADERS.CORRELATION_ID]: input.correlationId,
        [READER_HTTP_HEADERS.STUDY_RUN_ID]: input.studyRunId,
        [READER_HTTP_HEADERS.EXTRACTION_BATCH_ID]: input.extractionBatchId,
      });
    },
  };
}
