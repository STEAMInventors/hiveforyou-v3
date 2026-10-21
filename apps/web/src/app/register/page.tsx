import { AuthCard } from "@/components/auth/AuthCard";
import { AuthPage } from "@/components/auth/auth-ui";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string; checkEmail?: string; email?: string }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const checkEmail = params.checkEmail === "1";
  const rawEmail = params.email?.trim().toLowerCase() ?? "";
  const initialEmail = rawEmail.includes("@") ? rawEmail.slice(0, 320) : "";

  return (
    <AuthPage>
      <AuthCard mode="register" nextPath={next} checkEmail={checkEmail} initialEmail={initialEmail} />
    </AuthPage>
  );
}
