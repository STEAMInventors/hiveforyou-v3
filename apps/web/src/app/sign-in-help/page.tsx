import Link from "next/link";

import { AuthFrame, AuthHeading, AuthPage } from "@/components/auth/auth-ui";
import { SIGN_IN_HELP_BODY, SIGN_IN_HELP_TITLE } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInHelpPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/hives");
  const nextQuery = encodeURIComponent(next);

  return (
    <AuthPage>
      <AuthFrame>
        <AuthHeading title={SIGN_IN_HELP_TITLE} lede={SIGN_IN_HELP_BODY} />
        <p className="m-0 text-center text-sm leading-relaxed text-[#4A525C]">
          <Link href={`/login?next=${nextQuery}`} className="font-semibold text-[#2456B8] underline">
            Back to log in
          </Link>
          <span aria-hidden> · </span>
          <Link href={`/forgot-password?next=${nextQuery}`} className="font-semibold text-[#2456B8] underline">
            Forgot password
          </Link>
          <span aria-hidden> · </span>
          <Link href={`/register?next=${nextQuery}`} className="font-semibold text-[#2456B8] underline">
            Create an account
          </Link>
        </p>
      </AuthFrame>
    </AuthPage>
  );
}
