import { AuthCard } from "@/components/auth/AuthCard";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const linkError =
    params.error === "link_invalid"
      ? "That sign-in link is invalid or expired. Request a new one or log in with your password."
      : null;

  return (
    <div className="min-h-dvh bg-[#F7F8FA]">
      <AuthCard mode="login" nextPath={next} linkError={linkError} />
    </div>
  );
}
