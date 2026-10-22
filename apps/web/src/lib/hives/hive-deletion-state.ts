import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";

export function isHiveDeletionPending(hive: Pick<HiveV1, "deleting_at">): boolean {
  return hive.deleting_at !== null;
}
