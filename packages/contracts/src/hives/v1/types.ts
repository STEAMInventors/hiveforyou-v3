export const HIVE_NAME_MAX_LENGTH = 100;
export const HIVE_DESCRIPTION_MAX_LENGTH = 500;

export type HiveV1 = {
  id: string;
  name: string;
  description: string | null;
  client_request_id: string;
  created_at: string;
  updated_at: string;
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
