import { auth } from "@/lib/auth";
import { getCentralLoginUrl } from "@/lib/central-url";
import { getRegistrationTransferPath } from "@/lib/registration-transfer";
import { notFound, redirect } from "next/navigation";

export default async function RegistrationTransferLandingPage({
  params,
  searchParams
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ requestId }, query, session] = await Promise.all([params, searchParams, auth()]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  if (!token || token.length < 32 || token.length > 256) {
    notFound();
  }

  const accountPath = getRegistrationTransferPath(requestId, token);
  if (!session?.user?.id) {
    redirect(getCentralLoginUrl(accountPath));
  }

  redirect(accountPath);
}
