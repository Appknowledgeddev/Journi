# Trip workflows

## Behaviour

- Trip card rings count distinct active voters (plus the organiser) against the current eligible group. Deleted options and removed participants do not contribute.
- The organiser adds payment due dates and instructions when creating or editing an expense. A traveller can claim their own payment; it stays outstanding until the organiser confirms it. Confirmation records the organiser and timestamp. CSV export contains only the caller's authorised ledger.
- Decisions are locked per category. Reopening requires a reason and a future deadline. The shared trip deadline changes; other locked categories stay locked. Choosing an option requires an explanation, including any tie-break. Votes and selected-option edits are protected in the database.
- Joining or leaving never silently redistributes existing bills. The organiser receives a review notification; departed travellers lose access while the organiser keeps the records.
- Cancelled/completed/closed trips cannot receive new votes or reminder nudges. Outstanding balances remain available for reconciliation.
- Settings persist in-app/email channel preferences and invites/planning/payments topics. Preferences apply to new notifications; queued email preferences and membership are checked again before delivery.
- Database cron checks hourly for payments due tomorrow, today and three days overdue, and for unfinished votes within 24 hours of the deadline. Each event is recorded once. Claimed or confirmed payments and inactive members do not receive payment reminders.

## Email scheduler setup

In-app reminder scheduling is installed by `20260917100000_notification_preferences_reminders.sql` using Supabase `pg_cron`. It does not require an open browser.

Email delivery uses `/api/cron/notifications` and the existing backoffice email webhook. Configure `NEXT_PUBLIC_SITE_URL` to the HTTPS app origin and a strong `CRON_SECRET` on the deployed app. Schedule an HTTPS GET every five minutes with `Authorization: Bearer <CRON_SECRET>`. Keep the secret in the host's secret store, never in a committed configuration or URL. Vercel's cron integration sends this header when CRON_SECRET is configured; other providers must set it explicitly.

The worker leases batches of 25 with row locks, retries failures up to five times, and records sent/failed/skipped status in `notification_email_queue`. Email webhooks receive an `Idempotency-Key` header and email `idempotencyKey`; the receiving provider must deduplicate this key to prevent duplicates after a timeout. No historical inbox is backfilled into the queue. The worker also checks reminder generation, so either scheduler can safely retry.

Review failed deliveries in `notification_email_queue` (`last_error`, `attempts`). Fix the delivery configuration before retrying a failed record. This implements in-app and email delivery; it does not implement operating-system/browser Web Push subscriptions.

## Validation

- `node scripts/test-trip-costs.mjs`
- `node scripts/test-expense-receipts.mjs`
- `node scripts/test-invite-schema.mjs`
- `node scripts/test-notification-preferences.mjs`
- `scripts/test-trip-workflows.sql` (rollback-only database integration)
- Existing split and expense-notification SQL regression scripts (rollback-only)
- `npx tsc --noEmit` and focused ESLint
- Isolated browser fixture checks at 390px and 1100px: claim/awaiting confirmation, saved preference toggle, decision lock, no horizontal overflow or runtime errors. No live user messages or payments were used.

Pro trip limits remain unchanged until the conflicting unlimited/15-per-year requirement is resolved. Checkout prices are unchanged.
