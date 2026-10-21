import {
  HIVE_DESCRIPTION_MAX_LENGTH,
  HIVE_NAME_MAX_LENGTH,
} from "@hiveforyou/contracts/hives/v1";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export type ValidatedCreateHiveInput = {
  name: string;
  description: string | null;
  client_request_id: string;
};

export type ValidationFailure = {
  ok: false;
  message: string;
};

export function parseCreateHiveBody(
  body: unknown,
): { ok: true; value: ValidatedCreateHiveInput } | ValidationFailure {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(["name", "description", "client_request_id"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return { ok: false, message: `Unexpected field: ${key}.` };
    }
  }
  if (typeof record.name !== "string") {
    return { ok: false, message: "Hive name is required." };
  }
  if (typeof record.client_request_id !== "string") {
    return { ok: false, message: "client_request_id is required." };
  }
  if (!uuidSchema.safeParse(record.client_request_id).success) {
    return { ok: false, message: "client_request_id must be a UUID." };
  }
  let description: string | null = null;
  if (record.description !== undefined && record.description !== null) {
    if (typeof record.description !== "string") {
      return { ok: false, message: "Description must be a string." };
    }
    description = record.description;
  }

  const trimmedName = record.name.trim();
  const trimmedDescription = (description ?? "").trim();

  if (!trimmedName) {
    return { ok: false, message: "Give your Hive a name so you can find it later." };
  }
  if (trimmedName.length > HIVE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `Hive name must be ${HIVE_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (trimmedDescription.length > HIVE_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      message: `Description must be ${HIVE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  return {
    ok: true,
    value: {
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      client_request_id: record.client_request_id,
    },
  };
}

export function parseHiveIdParam(hiveId: string): boolean {
  return uuidSchema.safeParse(hiveId).success;
}
