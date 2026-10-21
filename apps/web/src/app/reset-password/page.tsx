import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthFrame, AuthHeading, AuthPage } from "@/components/auth/auth-ui";
import { FORGOT_PASSWORD_PATH, isRecoveryResetSession, RECOVERY_COOKIE_NAME } from "@/lib/auth/recovery";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const auth = await requireAuthenticatedUser();
  const cookieStore = await cookies();
  if (!isRecoveryResetSession(auth.ok, cookieStore.get(RECOVERY_COOKIE_NAME)?.value)) {
    redirect(`${FORGOT_PASSWORD_PATH}?error=link_invalid`);
  }

  return (
    <AuthPage>
      <AuthFrame>
        <AuthHeading
          title="Choose a new password"
          lede="This link opened a temporary sign-in. Set a new password before you continue."
        />
        <ResetPasswordForm />
      </AuthFrame>
    </AuthPage>
  );
}
