import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { AuthHeading } from "@/components/auth/auth-ui";
import { HiveCustomerShell } from "@/components/shell/HiveCustomerShell";
import { ACCOUNT_PASSWORD_PATH } from "@/lib/auth/recovery";
import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";

export default async function AccountPasswordPage() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    redirect(`/login?next=${encodeURIComponent(ACCOUNT_PASSWORD_PATH)}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";

  return (
    <HiveCustomerShell>
      <div
        className="mx-auto w-full max-w-[440px] px-4 py-10"
        style={{ fontFamily: "Figtree, var(--font-dm-sans), sans-serif" }}
      >
        <div className="flex flex-col gap-5 rounded-[20px] border border-[#E7E9ED] bg-white px-6 py-8 shadow-[0_1px_2px_rgba(31,35,40,0.04),0_8px_28px_rgba(31,35,40,0.06)] sm:px-9 sm:py-9">
          <AuthHeading
            title="Change password"
            lede="Enter your current password, then choose a new one."
          />
          <ChangePasswordForm email={email} />
        </div>
      </div>
    </HiveCustomerShell>
  );
}
