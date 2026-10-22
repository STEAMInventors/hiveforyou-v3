/** Bootstrap defaults matching seeded `hive3.upload_product_policy`; runtime values come from the quota API. */
export const UPLOAD_MAX_BYTES_DEFAULT = 26_214_400;
export const FREE_TIER_UPLOADS_PER_UTC_MONTH = 10;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export type SourceDocumentV1 = {
  id: string;
  hive_id: string;
  client_request_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string | null;
  status: "pending" | "registered" | "abandoned" | "failed";
  created_at: string;
  registered_at: string | null;
  study_locked?: boolean;
  can_delete?: boolean;
  can_replace?: boolean;
};

export type UploadQuotaV1 = {
  used: number;
  limit: number;
  remaining: number;
  month_start_utc: string;
  month_end_utc: string;
};

export type UploadCommercialOfferV1 = {
  upload_count: number;
  price_cents: number;
  currency: string;
  payments_enabled: boolean;
};

export type UploadProductPolicyV1 = {
  max_file_bytes: number;
  allowed_mime_types: AllowedUploadMimeType[];
  free_uploads_per_utc_month: number;
  commercial_offer: UploadCommercialOfferV1;
};

export type ListDocumentsResponseV1 = {
  documents: SourceDocumentV1[];
};

export type UploadQuotaResponseV1 = {
  quota: UploadQuotaV1;
  policy: UploadProductPolicyV1;
};

export type PrepareDocumentUploadRequestV1 = {
  client_request_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  supersedes_document_id?: string;
};

export type PrepareDocumentUploadResponseV1 = {
  prepare: {
    document_id: string;
    storage_path: string;
    status: string;
    byte_size: number;
    mime_type: string;
    filename: string;
    replayed: boolean;
  };
  upload: {
    bucket: string;
    path: string;
    signed_url: string;
    token: string;
  };
};

export type CompleteDocumentUploadRequestV1 = {
  client_request_id: string;
  sha256: string;
  byte_size: number;
};

export type CompleteDocumentUploadResponseV1 = {
  complete: {
    document_id: string;
    status: string;
    registered_at: string | null;
    replayed: boolean;
  };
};

export type AbortDocumentUploadRequestV1 = {
  client_request_id: string;
  reason?: "abandoned" | "failed";
};

export type DismissFailedDocumentUploadRequestV1 = {
  client_request_id: string;
};

export type DismissFailedDocumentUploadResponseV1 = {
  dismiss: {
    document_id: string;
    dismissed: boolean;
  };
};

export type DeleteRegisteredDocumentUploadRequestV1 = {
  client_request_id: string;
};

export type DeleteRegisteredDocumentUploadResponseV1 = {
  delete: {
    document_id: string;
    deleted: boolean;
  };
};
