export {
  HIVE_DESCRIPTION_MAX_LENGTH,
  HIVE_NAME_MAX_LENGTH,
} from "@hiveforyou/contracts/hives/v1";

export type CreateHiveValidationResult =
  | { ok: true; hiveName: string; hiveDescription: string | null }
  | { ok: false; hiveNameError?: string; hiveDescriptionError?: string };

export function validateCreateHiveInput(input: {
  hiveName: string;
  hiveDescription: string;
}): CreateHiveValidationResult {
  const trimmedName = input.hiveName.trim();
  const trimmedDescription = input.hiveDescription.trim();

  let hiveNameError: string | undefined;
  let hiveDescriptionError: string | undefined;

  if (!trimmedName) {
    hiveNameError = "Give your Hive a name so you can find it later.";
  } else if (trimmedName.length > 100) {
    hiveNameError = "Hive name must be 100 characters or fewer.";
  }

  if (trimmedDescription.length > 500) {
    hiveDescriptionError = "Description must be 500 characters or fewer.";
  }

  if (hiveNameError || hiveDescriptionError) {
    return { ok: false, hiveNameError, hiveDescriptionError };
  }

  return {
    ok: true,
    hiveName: trimmedName,
    hiveDescription: trimmedDescription.length > 0 ? trimmedDescription : null,
  };
}
