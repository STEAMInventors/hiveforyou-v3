import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ErrorCode,
  type ErrorCode as ErrorCodeType,
} from "@hiveforyou/contracts/errors/v1";
import type {
  CreateHiveResponseV1,
  GetHiveResponseV1,
  HiveV1,
  ListHivesResponseV1,
} from "@hiveforyou/contracts/hives/v1";

import {
  classifyPostgrestError,
  isAbortError,
} from "@/lib/server/supabase-errors";

import type { ValidatedCreateHiveInput } from "./validation";
import {
  getOwnedHiveByClientRequestId,
  getOwnedHiveById,
  HiveRepositoryError,
  insertHive,
  listOwnedHives,
} from "./repository";

export type HiveServiceError = {
  error_code: ErrorCodeType;
  message_safe: string;
  retryable: boolean;
  diagnostic_detail: string;
};

function serviceError(
  error_code: ErrorCodeType,
  message_safe: string,
  retryable: boolean,
  diagnostic_detail: string,
): HiveServiceError {
  return { error_code, message_safe, retryable, diagnostic_detail };
}

function mapRepositoryFailure(failure: HiveRepositoryError["failure"]): HiveServiceError {
  const code = failure.error_code;
  const error_code =
    code === "AUTH_FAILED" ||
    code === "ACCESS_DENIED" ||
    code === "NOT_FOUND" ||
    code === "INVALID_REQUEST" ||
    code === "DB_TRANSIENT" ||
    code === "DB_OUTCOME_UNKNOWN" ||
    code === "DEPENDENCY_UNAVAILABLE"
      ? (code as ErrorCodeType)
      : ErrorCode.DEPENDENCY_UNAVAILABLE;
  return serviceError(
    error_code,
    failure.message_safe,
    failure.retryable,
    failure.diagnostic_detail,
  );
}

function mapThrown(error: unknown): HiveServiceError {
  if (error instanceof HiveRepositoryError) {
    return mapRepositoryFailure(error.failure);
  }
  if (isAbortError(error)) {
    return serviceError(
      ErrorCode.DB_OUTCOME_UNKNOWN,
      "We could not confirm whether your Hive was saved. Try again with the same request.",
      true,
      "timeout",
    );
  }
  if (error && typeof error === "object" && "code" in error) {
    const classified = classifyPostgrestError(error as { code?: string });
    if (classified.diagnostic_detail === "unique_violation") {
      return serviceError(
        ErrorCode.INVALID_REQUEST,
        "This create request was already processed.",
        false,
        "unique_violation",
      );
    }
    const message =
      classified.error_code === ErrorCode.ACCESS_DENIED
        ? "You do not have access to this Hive."
        : classified.error_code === ErrorCode.DB_TRANSIENT
          ? "Database is temporarily unavailable. Please try again."
          : "Something went wrong. Please try again.";
    return serviceError(
      classified.error_code,
      message,
      classified.retryable,
      classified.diagnostic_detail,
    );
  }
  return serviceError(
    ErrorCode.DEPENDENCY_UNAVAILABLE,
    "Something went wrong. Please try again.",
    true,
    "unknown",
  );
}

export async function listHivesForUser(
  client: SupabaseClient,
  correlationId: string,
): Promise<{ ok: true; body: ListHivesResponseV1 } | { ok: false; error: HiveServiceError }> {
  try {
    const hives = await listOwnedHives(client, correlationId);
    return { ok: true, body: { hives } };
  } catch (error) {
    return { ok: false, error: mapThrown(error) };
  }
}

export async function getHiveForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
): Promise<{ ok: true; body: GetHiveResponseV1 } | { ok: false; error: HiveServiceError }> {
  try {
    const hive = await getOwnedHiveById(client, hiveId, correlationId);
    if (!hive) {
      return {
        ok: false,
        error: serviceError(
          ErrorCode.NOT_FOUND,
          "We could not find that Hive.",
          false,
          "not_found",
        ),
      };
    }
    return { ok: true, body: { hive } };
  } catch (error) {
    return { ok: false, error: mapThrown(error) };
  }
}

export async function createHiveForUser(
  client: SupabaseClient,
  input: ValidatedCreateHiveInput,
  correlationId: string,
): Promise<{ ok: true; body: CreateHiveResponseV1 } | { ok: false; error: HiveServiceError }> {
  try {
    const existing = await getOwnedHiveByClientRequestId(
      client,
      input.client_request_id,
      correlationId,
    );
    if (existing) {
      return { ok: true, body: { hive: existing, created: false } };
    }

    try {
      const hive = await insertHive(client, input, correlationId);
      return { ok: true, body: { hive, created: true } };
    } catch (insertError) {
      const isUniqueReplay =
        insertError instanceof HiveRepositoryError &&
        insertError.failure.error_code === ErrorCode.INVALID_REQUEST;
      if (isUniqueReplay) {
        const replay = await getOwnedHiveByClientRequestId(
          client,
          input.client_request_id,
          correlationId,
        );
        if (replay) {
          return { ok: true, body: { hive: replay, created: false } };
        }
        return {
          ok: false,
          error: serviceError(
            ErrorCode.DB_OUTCOME_UNKNOWN,
            "We could not confirm whether your Hive was saved. Try again with the same request.",
            true,
            "unique_without_row",
          ),
        };
      }
      throw insertError;
    }
  } catch (error) {
    return { ok: false, error: mapThrown(error) };
  }
}

export type { HiveV1 };
