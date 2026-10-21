import { AuthCard } from "@/components/auth/AuthCard";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string; checkEmail?: string }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const checkEmail = params.checkEmail === "1";

  return (
    <div className="min-h-dvh bg-[#F7F8FA]">
      <AuthCard mode="register" nextPath={next} checkEmail={checkEmail} />
    </div>
  );
}
