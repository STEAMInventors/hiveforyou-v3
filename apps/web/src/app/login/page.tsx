import { AuthCard } from "@/components/auth/AuthCard";
import { AuthPage } from "@/components/auth/auth-ui";
import { authLinkErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const linkError = authLinkErrorMessage(params.error, "login");

  return (
    <AuthPage>
      <AuthCard mode="login" nextPath={next} linkError={linkError} />
    </AuthPage>
  );
}
