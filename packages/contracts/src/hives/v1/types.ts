export const HIVE_NAME_MAX_LENGTH = 100;
export const HIVE_DESCRIPTION_MAX_LENGTH = 500;

export type HiveV1 = {
  id: string;
  name: string;
  description: string | null;
  client_request_id: string;
  created_at: string;
  updated_at: string;
  /** Non-null while permanent deletion is in progress (owner can retry from My Hives). */
  deleting_at: string | null;
  /** Present after P1.7-A list RPC migration; omitted on older backends. */
  registered_document_count?: number;
  /** Up to three newest registered filenames; present after P1.7-A migration. */
  preview_filenames?: string[];
};

export type ListHivesResponseV1 = {
  hives: HiveV1[];
};

export type CreateHiveRequestV1 = {
  name: string;
  description?: string | null;
  client_request_id: string;
};

export type CreateHiveResponseV1 = {
  hive: HiveV1;
  created: boolean;
};

export type GetHiveResponseV1 = {
  hive: HiveV1;
};

export type DeleteHiveResponseV1 = {
  deleted: true;
};
