import { ProOrganiserClient } from "../pro-organiser-client";

export default async function ProOrganiserPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; compact?: string; returnPath?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialBilling =
    resolvedSearchParams.billing === "yearly" ? "yearly" : "monthly";
  const compact = resolvedSearchParams.compact === "1";
  const returnPath =
    typeof resolvedSearchParams.returnPath === "string"
      ? resolvedSearchParams.returnPath
      : "/dashboard?checkout=complete";

  return (
    <ProOrganiserClient
      initialBilling={initialBilling}
      compact={compact}
      returnPath={returnPath}
    />
  );
}
