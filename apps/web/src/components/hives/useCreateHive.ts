"use client";

import { useCallback, useRef, useState } from "react";

import { validateCreateHiveInput } from "@/components/landing/create-hive-validation";
import { createHive, HiveApiError } from "@/lib/hives/client";

export function useCreateHive() {
  const [hiveName, setHiveName] = useState("");
  const [hiveDescription, setHiveDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const clientRequestIdRef = useRef<string>(crypto.randomUUID());

  const resetForm = useCallback(() => {
    setHiveName("");
    setHiveDescription("");
    setNameError(null);
    setDescriptionError(null);
    setSubmitError(null);
    clientRequestIdRef.current = crypto.randomUUID();
  }, []);

  const submit = useCallback(async (): Promise<{ hiveId: string } | null> => {
    const validation = validateCreateHiveInput({ hiveName, hiveDescription });
    if (!validation.ok) {
      setNameError(validation.hiveNameError ?? null);
      setDescriptionError(validation.hiveDescriptionError ?? null);
      return null;
    }
    setNameError(null);
    setDescriptionError(null);
    setSubmitError(null);
    setSubmitBusy(true);
    try {
      const result = await createHive({
        name: validation.hiveName,
        description: validation.hiveDescription,
        client_request_id: clientRequestIdRef.current,
      });
      return { hiveId: result.hive.id };
    } catch (error) {
      if (error instanceof HiveApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Could not create your Hive. Please try again.");
      }
      return null;
    } finally {
      setSubmitBusy(false);
    }
  }, [hiveDescription, hiveName]);

  return {
    hiveName,
    hiveDescription,
    nameError,
    descriptionError,
    submitBusy,
    submitError,
    setHiveName,
    setHiveDescription,
    resetForm,
    submit,
  };
}
