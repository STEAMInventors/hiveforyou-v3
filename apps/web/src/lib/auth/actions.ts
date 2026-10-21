"use server";

import { redirect } from "next/navigation";

import { headers } from "next/headers";

import { resolveAppOrigin } from "@/lib/config/app-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readServerEnv } from "@/lib/server/env";

import { safeNextPath } from "./redirects";

export type AuthActionState = {
  error?: string;
};

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""), "/hives");

  if (!email || !password) {
    return { error: "Enter your email and password to log in." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "We could not log you in. Check your email and password." };
  }
  redirect(next);
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""), "/hives");
  readServerEnv();
  const headerStore = await headers();
  const appOrigin = resolveAppOrigin({ hostHeader: headerStore.get("host") });

  if (!email || !password) {
    return { error: "Enter your email and password to create an account." };
  }
  if (password.length < 10) {
    return { error: "Use at least 10 characters for your password." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(next)}`,
      data: name ? { full_name: name } : undefined,
    },
  });

  if (error) {
    return { error: "We could not create your account. Try a different email." };
  }

  if (data.session) {
    redirect(next);
  }

  redirect(`/register?checkEmail=1&next=${encodeURIComponent(next)}`);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
