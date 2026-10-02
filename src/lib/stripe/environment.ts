export type StripeMode = "test" | "live";

export function stripeKeyMode(key: string | undefined, kind: "publishable" | "secret"): StripeMode | null {
  const prefix = kind === "publishable" ? "pk" : "sk";
  if (key?.startsWith(`${prefix}_test_`)) return "test";
  if (key?.startsWith(`${prefix}_live_`)) return "live";
  // Restricted server keys also identify the Stripe environment.
  if (kind === "secret" && key?.startsWith("rk_test_")) return "test";
  if (kind === "secret" && key?.startsWith("rk_live_")) return "live";
  return null;
}

export function billingEnvironment(secretKey: string | undefined, publishableKey: string | undefined) {
  const mode = stripeKeyMode(secretKey, "secret");
  const browserMode = stripeKeyMode(publishableKey, "publishable");
  return { mode, ready: Boolean(mode && browserMode && mode === browserMode) };
}

export function getBillingEnvironment() {
  return billingEnvironment(process.env.STRIPE_SECRET_KEY, process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function requireBillingEnvironment(browserMode?: unknown): StripeMode {
  const environment = getBillingEnvironment();
  if (!environment.ready || !environment.mode) throw new Error("Payments are unavailable because the Stripe test/live configuration needs attention.");
  if (browserMode !== undefined && browserMode !== environment.mode) throw new Error("The payment environment has changed. Refresh the page before trying again.");
  return environment.mode;
}

export function requireStripeObjectMode(livemode: boolean) {
  const mode = requireBillingEnvironment();
  if (livemode !== (mode === "live")) throw new Error("This Stripe record belongs to a different payment environment.");
}
