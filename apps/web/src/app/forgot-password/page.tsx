import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthFrame, AuthHeading, AuthPage } from "@/components/auth/auth-ui";
import { authLinkErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const linkError = authLinkErrorMessage(params.error, "recovery");

  return (
    <AuthPage>
      <AuthFrame>
        <AuthHeading
          title="Reset your password"
          lede="Enter the email on your account. If it's registered, we'll send a link to choose a new password."
        />
        <ForgotPasswordForm nextPath={next} linkError={linkError} />
      </AuthFrame>
    </AuthPage>
  );
}
