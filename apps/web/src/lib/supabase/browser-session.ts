import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Best-effort session probe for client UI; never throws. */
export async function readBrowserAuthSignedIn(): Promise<boolean> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return false;
    }
    return Boolean(data.user);
  } catch {
    return false;
  }
}
