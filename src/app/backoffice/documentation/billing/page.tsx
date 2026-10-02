"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";
import guide from "./page.module.css";
import { billingScenarioGroups, billingScenarioCount } from "./scenarios";

const sections = [
  {
    id: "plans", title: "Prices and allowances",
    paragraphs: [
      "Free: £0. One free trip creation per account in total, not one per month or one at a time. Deleting a trip does not restore this allowance. A draft saved only in the browser has not consumed it; creating the trip in the database does, including a database draft.",
      "Trip Pass: £39 GBP, paid once, for one additional trip creation. It is not a subscription. The paid Checkout Session can be used only once, and deleting its trip does not make it reusable.",
      "Pro Organiser: £19 GBP per month or £179 GBP per year, charged as a recurring Stripe subscription. Verified active or trialing Pro subscriptions allow further trip creation without a numeric trip limit. Checkout does not currently configure a trial period.",
      "The trip creation form permits five traveller invitations on Free and lifts this form limit for Pro or a verified Trip Pass. This is currently a browser-side restriction: the finalise API does not enforce the five-invite cap.",
      "Prices are defined in the checkout route in pence: 3900, 1900 and 17900. The route does not enable automatic tax, promotion codes or configurable quantities. Changing these prices also requires reviewing Trip Pass verification, which currently checks for exactly £39 GBP.",
    ], sources: ["src/app/api/stripe/checkout-session/route.ts", "src/lib/trip-creation-access.ts", "src/app/trip-organiser/page.tsx"],
  },
  {
    id: "checkout", title: "From upgrade to completed checkout",
    paragraphs: [
      "A free user starting a new trip sees a choice to buy a Trip Pass, subscribe, or continue with their first free trip. The free continuation is offered only after the allowance check succeeds. Once that allowance is used, the dialog offers the paid options. Users can also open the upgrade flow beside Add traveller.",
      "Checkout requires a signed-in account. The server validates the bearer token and takes the account ID and email from the authenticated user, rather than trusting an email sent by the browser. Each session carries the account ID in client_reference_id and metadata.user_id, plus the product identifier. Pro subscriptions also receive account and product metadata.",
      "Stripe Checkout is embedded in the payment screen. The server creates the price inline, using payment mode for Trip Pass and subscription mode for Pro. The return address must stay on the app’s origin and includes checkout_session_id. A return URL or a browser flag alone does not grant access.",
      "The organiser preserves the current draft before upgrade and checks the returned session through /api/trip-access. A verified session ID is retained in account-specific session storage during that browser session and passed to finalise. It is cleared after successful trip creation. There is no persistent unused-pass wallet or automatic lookup of earlier Trip Pass purchases by email.",
    ], sources: ["src/components/first-trip-plan-prompt.tsx", "src/components/trip-upgrade-modal.tsx", "src/app/api/trip-access/route.ts", "src/app/trip-organiser/page.tsx"],
  },
  {
    id: "verification", title: "What authorises a new trip",
    paragraphs: [
      "The finalise API authenticates the user and checks access again on the server. It accepts an unused free allowance, a verified unused Trip Pass, or an eligible Stripe subscription. Editing the profile’s plan label or setting a browser unlock flag does not satisfy this creation check.",
      "For a Trip Pass, Stripe must report a complete payment-mode session, payment_status paid, product trip_pass, GBP currency and an amount_total of 3900. Both session account identifiers must match the signed-in account. The ledger must not already contain that Checkout Session ID.",
      "For Pro, the Stripe subscription must be active or trialing. Matching account and pro_organiser metadata identify newer subscriptions. For older subscriptions without those identifiers, the checker recognises a Stripe product named Journi Pro Organiser (including its monthly/yearly suffix); conflicting account metadata is rejected.",
      "A returned subscription Checkout Session is checked directly. If there is no verified paid session and the free allowance is already used, the checker searches Stripe customers under the authenticated account email and checks their subscriptions. It does not perform that email lookup while the free allowance remains available. Consequently, without a returned subscription session, even a subscriber may use their still-unused free allowance first.",
      "When multiple access types have been verified, finalise chooses subscription, then Trip Pass, then free. If no access is available it returns HTTP 402 with TRIP_LIMIT_REACHED and the organiser opens the upgrade choices. A verification failure blocks creation rather than granting access.",
    ], sources: ["src/lib/trip-creation-access.ts", "src/app/api/trip-organiser/finalise/route.ts"],
  },
  {
    id: "ledger", title: "The allowance ledger and deletion",
    paragraphs: [
      "trip_creation_ledger records the trip ID, owner, access kind, optional Trip Pass Checkout Session ID and creation time. The access kinds are free, trip_pass, subscription and legacy. Database uniqueness allows one free entry per owner and one use per Checkout Session, including when requests arrive simultaneously.",
      "The server-only create_trip_with_access function inserts the grant and trip atomically. Direct client inserts into trips are revoked. A trigger also guards older server insertion paths by treating ungranted inserts as free creations.",
      "Ledger entries survive normal trip deletion. A failed trip insert rolls its grant back; the finalise route also uses rollback_trip_creation if saving related planning or participant records fails. If cleanup itself fails, the API reports the existing trip ID instead of claiming the allowance was restored. This cleanup does not refund Stripe payments.",
      "The migration marks each existing owner’s earliest trip as free and their other existing trips as legacy. Existing trips are retained. Trips deleted before the migration cannot be reconstructed from this backfill. Deleting the account removes its ledger through the owner foreign key; this is an account allowance, not a cross-account identity limit.",
    ], sources: ["supabase/migrations/20261002144823_enforce_single_free_trip.sql", "src/app/api/trip-organiser/finalise/route.ts"],
  },
  {
    id: "subscriptions", title: "Renewals, cancellation and invoices",
    paragraphs: [
      "Stripe manages the recurring monthly or yearly charge. The Subscription page looks up customers by email (up to ten), then subscriptions for each (up to ten), returning the first active or trialing subscription it finds. This older display endpoint does not apply the newer Pro product verification used when creating a trip.",
      "Cancel sets cancel_at_period_end to true. It does not immediately cancel the subscription or issue a refund. While Stripe still reports active or trialing, the trip creation check continues to allow Pro access. At the end of the period, an ineligible status no longer grants new-trip access.",
      "Reactivate sets cancel_at_period_end to false on the subscription. It removes a scheduled cancellation; the route does not create a replacement for an already ended subscription. Neither action deletes existing trips.",
      "Payment methods and invoices opens a Stripe Billing Portal session for the first customer found by email. The options inside the portal depend on the Stripe account’s portal configuration, which is not defined here. There is no dedicated in-app refund flow or monthly/yearly switch endpoint in this checkout integration.",
    ], sources: ["src/app/subscription/page.tsx", "src/app/api/stripe/subscription-status/route.ts", "src/app/api/stripe/subscription-action/route.ts", "src/app/api/stripe/billing-portal-session/route.ts"],
  },
  {
    id: "records", title: "What backoffice billing records mean",
    paragraphs: [
      "Stripe is the source for actual checkout payment and subscription state. The trip creation ledger records which allowance created a trip. Backoffice Payments reads database payment rows; Subscriptions combines stored user metadata and payment-linked Stripe identifiers. These views are not a live Stripe transaction or invoice export.",
      "Trip expenses, split bills and their due/paid statuses are a separate recording workflow. Marking an expense payment as paid does not, by itself, create a Stripe charge or buy a Journi Trip Pass. Editing a database payment row or a user’s plan in backoffice does not change Stripe billing.",
      "The app shell can update profile metadata after finding a subscription. However, it skips this lookup for accounts already labelled active Pro and does not downgrade metadata when no subscription is found. Plan badges and the backoffice subscription view can therefore be stale; use the verified creation check and Stripe for access investigations.",
      "No Stripe event webhook handler is implemented in this repository. There is no automatic webhook-driven reconciliation for renewals, cancellations, refunds or disputes in this code. The Make email-notification webhook is a separate integration, not a Stripe billing event handler. External automations and Stripe dashboard settings are outside this code review.",
    ], sources: ["src/app/api/backoffice/summary/route.ts", "src/components/app-shell.tsx", "src/components/trip-expense-payments.tsx"],
  },
  {
    id: "gaps", title: "Current inconsistencies to know about",
    paragraphs: [
      "Publishing an existing draft still uses an older rule: a user without Pro profile metadata is blocked when they already own one active trip. That publish path does not consult the new creation ledger or validate a Trip Pass. A paid trip created as a draft can therefore encounter a different rule when published later.",
      "The subscription-status, subscription-action and billing-portal-session API routes currently accept browser-supplied email or subscription IDs without authenticating the request or verifying ownership. The authenticated checkout and trip-creation checks do not protect these separate endpoints. These routes need access-control work; this documentation change does not repair them.",
      "Refunds and disputes are not checked when validating Trip Pass access beyond the Checkout Session fields described above. Without a billing webhook or refund reconciliation, do not assume a refund automatically revokes a pass. A lost checkout return/session also has no self-service pass recovery flow.",
      "Pro’s checkout description advertises unlimited trips, no expiry, templates and priority support. This guide confirms the billing and trip-creation behaviour in code; that marketing description is not evidence that every advertised feature is implemented.",
    ], sources: ["src/app/api/trips/[id]/route.ts", "src/app/api/stripe/subscription-action/route.ts", "src/app/api/stripe/billing-portal-session/route.ts", "src/lib/trip-creation-access.ts"],
  },
  {
    id: "support", title: "Billing support checklist",
    paragraphs: [
      "Start with the user’s account ID, account email, affected trip and any Checkout Session or subscription ID. Establish whether the issue is a Journi purchase or a recorded trip expense.",
      "For a blocked free trip, check for an existing free entry in trip_creation_ledger. A deleted trip can still account for that entry. Do not delete ledger entries merely to clear a warning.",
      "For a paid Trip Pass, check the actual Stripe session’s ownership, product, amount, currency, completion and payment state, then whether its session ID already appears in the ledger. If the return session was lost, investigate the purchase rather than asking the user to pay again automatically.",
      "For Pro, check the current Stripe status, product/account metadata and customer email. Compare those with the app’s cached plan label. Distinguish creating a new trip from publishing an existing draft, because the checks currently differ.",
      "The app and backoffice show the Stripe mode derived from the configured keys. Checkout labels test versus real-money payments. Mismatched or missing keys block Stripe routes; checkout also compares the browser build’s mode with the server. Verified checkout/subscription objects must have the matching livemode value. These checks do not prove that same-mode keys belong to the same Stripe account or sandbox. Stripe may still reject a mismatched account pair.",
      "Test mode isolates Stripe payments, not Journi data. Trips, free allowances, email notifications and profile metadata still use this deployment’s database. Do not treat a test badge as a separate app environment; use separate deployment/database configuration for isolated testing. Changing keys requires restarting/redeploying and rebuilding the public key in the browser bundle.",
      "For checkout failures, confirm the deployed server has STRIPE_SECRET_KEY and the frontend has NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from the same Stripe environment. Never put secret values into this guide. Test and live Stripe records are separate.",
      "This document describes the checked-in implementation reviewed on 2 October 2026. It is a manually maintained reference, not a live account audit. Confirm the deployed app version, database migration and Stripe dashboard configuration before promising a production outcome.",
    ], sources: ["src/lib/stripe/server.ts", "src/app/signup/trip-pass/trip-pass-client.tsx", "src/app/signup/pro-organiser/pro-organiser-client.tsx", "src/lib/trip-creation-access.ts"],
  },
];

export default function BillingDocumentationPage() {
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [scenarioStatus, setScenarioStatus] = useState("All");
  const filteredGroups = billingScenarioGroups.map(group => ({ ...group, scenarios: group.scenarios.filter(item =>
    (scenarioStatus === "All" || item.status === scenarioStatus) &&
    `${item.id} ${group.title} ${item.title} ${item.outcome} ${item.check}`.toLowerCase().includes(scenarioQuery.trim().toLowerCase())
  ) })).filter(group => group.scenarios.length > 0);
  const visibleCount = filteredGroups.reduce((sum, group) => sum + group.scenarios.length, 0);
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setAccess("denied");
          return;
        }
        const response = await fetch("/api/backoffice/summary", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!cancelled) setAccess(response.ok ? "allowed" : "denied");
      } catch {
        if (!cancelled) setAccess("denied");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (access !== "allowed") return (
    <main className={guide.document}>
      <h1>Billing documentation</h1>
      <p role="status">{access === "loading" ? "Checking backoffice access…" : "An authorised backoffice session is required to view this guide."}</p>
      {access === "denied" ? <Link href="/signin?next=/backoffice/documentation/billing">Sign in to backoffice</Link> : null}
    </main>
  );
  return (
    <main className={styles.backoffice}>
      <BackofficeRail active="documentation" />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div><p className={styles.kicker}>Documentation · Billing</p><h1>How billing works</h1><span>Current implementation · Reviewed 2 October 2026</span></div>
          <Link className={styles.exitLink} href="/backoffice#documentation">All documentation</Link>
        </header>
        <div className={guide.document}>
          <p className={guide.intro}>An operational reference for Free, Trip Pass and Pro Organiser: what is charged, how access is granted, what the backoffice shows, and where the current flows differ.</p>
          <nav className={guide.contents} aria-label="Billing guide contents">
            <a href="#scenarios">Billing scenarios · {billingScenarioCount} cases</a>
            {sections.map((section, index) => <a key={section.id} href={`#${section.id}`}>{index + 1}. {section.title}</a>)}
          </nav>
          <section id="scenarios" className={guide.section}>
            <h2>Billing scenarios</h2>
            <p>Each case describes the current code, not a proposed policy. “Current limitation” identifies missing or inconsistent behaviour. “Stripe configuration” means the result also depends on settings outside this repository. Related implementation references are in the guide sections linked below.</p>
            <div className={guide.scenarioControls}>
              <label>Search scenarios<input type="search" value={scenarioQuery} onChange={event => setScenarioQuery(event.target.value)} placeholder="Try refund, free trip, failed payment…" /></label>
              <label><span>Behaviour</span><select aria-label="Behaviour" value={scenarioStatus} onChange={event => setScenarioStatus(event.target.value)}>
                <option>All</option><option>Implemented</option><option>Current limitation</option><option>Stripe configuration</option>
              </select></label>
            </div>
            <p role="status">Showing {visibleCount} of {billingScenarioCount} scenarios</p>
            {filteredGroups.length ? filteredGroups.map(group => (
              <section key={group.id} className={guide.scenarioGroup}>
                <h3>{group.title}</h3>
                <a className={guide.referenceLink} href={`#${group.reference}`}>Related rules and implementation references</a>
                {group.scenarios.map(item => (
                  <details key={item.id} className={guide.scenario}>
                    <summary><span className={guide.scenarioId}>{item.id}</span><strong>{item.title}</strong><span className={guide.scenarioBadge}>{item.status}</span></summary>
                    <div><h4>What happens now</h4><p>{item.outcome}</p><h4>What to check</h4><p>{item.check}</p></div>
                  </details>
                ))}
              </section>
            )) : <p>No scenarios match these filters. <button type="button" onClick={() => { setScenarioQuery(""); setScenarioStatus("All"); }}>Clear filters</button></p>}
          </section>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className={guide.section}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <details><summary>Implementation references</summary><ul>{section.sources.map((source) => <li key={source}><code>{source}</code></li>)}</ul></details>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
