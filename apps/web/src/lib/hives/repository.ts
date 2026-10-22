import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";

import {
  edgeDeleteHive,
  edgeGetHive,
  edgeGetHiveByClientRequestId,
  edgeInsertHive,
  edgeListHives,
  type HiveEdgeFailure,
  type HiveRowPayload,
} from "./hive-edge-gateway";

export class HiveRepositoryError extends Error {
  readonly failure: HiveEdgeFailure;

  constructor(failure: HiveEdgeFailure) {
    super(failure.diagnostic_detail);
    this.name = "HiveRepositoryError";
    this.failure = failure;
  }
}

function toHiveV1(row: HiveRowPayload): HiveV1 {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleting_at: row.deleting_at,
    registered_document_count: row.registered_document_count,
    preview_filenames: row.preview_filenames,
  };
}

function unwrapHive(result: Awaited<ReturnType<typeof edgeGetHive>>): HiveV1 | null {
  if (!result.ok) {
    throw new HiveRepositoryError(result.error);
  }
  if (result.data.kind !== "hive") {
    throw new HiveRepositoryError({
      error_code: "DEPENDENCY_UNAVAILABLE",
      message_safe: "Something went wrong. Please try again.",
      retryable: true,
      diagnostic_detail: "unexpected_edge_shape",
    });
  }
  if (!result.data.hive) {
    return null;
  }
  return toHiveV1(result.data.hive);
}

function correlationIdForRequest(): string {
  return "web-repository";
}

export async function listOwnedHives(
  client: SupabaseClient,
  correlationId = correlationIdForRequest(),
): Promise<HiveV1[]> {
  const result = await edgeListHives(client, correlationId);
  if (!result.ok) {
    throw new HiveRepositoryError(result.error);
  }
  if (result.data.kind !== "list") {
    throw new HiveRepositoryError({
      error_code: "DEPENDENCY_UNAVAILABLE",
      message_safe: "Something went wrong. Please try again.",
      retryable: true,
      diagnostic_detail: "unexpected_edge_shape",
    });
  }
  return result.data.hives.map(toHiveV1);
}

export async function getOwnedHiveById(
  client: SupabaseClient,
  hiveId: string,
  correlationId = correlationIdForRequest(),
): Promise<HiveV1 | null> {
  return unwrapHive(await edgeGetHive(client, correlationId, hiveId));
}

export async function getOwnedHiveByClientRequestId(
  client: SupabaseClient,
  clientRequestId: string,
  correlationId = correlationIdForRequest(),
): Promise<HiveV1 | null> {
  return unwrapHive(await edgeGetHiveByClientRequestId(client, correlationId, clientRequestId));
}

export async function insertHive(
  client: SupabaseClient,
  input: { name: string; description: string | null; client_request_id: string },
  correlationId = correlationIdForRequest(),
): Promise<HiveV1> {
  const result = await edgeInsertHive(client, correlationId, input);
  if (!result.ok) {
    throw new HiveRepositoryError(result.error);
  }
  if (result.data.kind !== "hive" || !result.data.hive) {
    throw new HiveRepositoryError({
      error_code: "DB_OUTCOME_UNKNOWN",
      message_safe: "We could not confirm whether your Hive was saved. Try again with the same request.",
      retryable: true,
      diagnostic_detail: "insert_without_row",
    });
  }
  return toHiveV1(result.data.hive);
}

export async function deleteOwnedHive(
  client: SupabaseClient,
  hiveId: string,
  correlationId = correlationIdForRequest(),
): Promise<void> {
  const result = await edgeDeleteHive(client, correlationId, hiveId);
  if (!result.ok) {
    throw new HiveRepositoryError(result.error);
  }
  if (result.data.kind !== "deleted") {
    throw new HiveRepositoryError({
      error_code: "DB_OUTCOME_UNKNOWN",
      message_safe: "We could not confirm whether your Hive was deleted. Try again.",
      retryable: true,
      diagnostic_detail: "delete_without_confirmation",
    });
  }
}
