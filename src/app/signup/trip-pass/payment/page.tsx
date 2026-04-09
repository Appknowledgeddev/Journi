import { TripPassClient } from "../trip-pass-client";

export default async function TripPassPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ compact?: string; returnPath?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const compact = resolvedSearchParams.compact === "1";
  const returnPath =
    typeof resolvedSearchParams.returnPath === "string"
      ? resolvedSearchParams.returnPath
      : "/dashboard?checkout=complete";

  return <TripPassClient compact={compact} returnPath={returnPath} />;
}
