"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";
type Action = {
  action_key: string;
  label: string;
  category: string;
  enabled: boolean;
  send_push: boolean;
  send_email: boolean;
  recipient_types: string[];
  email_notification_id: string | null;
  suppress_email_when_active: boolean;
  active_window_minutes: number;
};
type Rule = {
  id: string;
  title: string;
  subject: string;
  templateMode: "global" | "custom";
};
type Delivery = {
  id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_type: string;
  channel: string;
  status: string;
  error: string | null;
};
type AudienceEvaluation = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  connection_type: string;
  membership_status: string | null;
  selected: boolean;
  reason: string;
};
type Batch = {
  id: string;
  action_key: string;
  email_notification_id: string | null;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  notification_deliveries: Delivery[];
  notification_audience_evaluations: AudienceEvaluation[];
};
const recipientOptions = [
  ["organiser", "Organiser"],
  ["active_participants", "Active participants"],
  ["invited_participants", "Invited participants"],
  ["invited_participant", "New invitee"],
  ["affected_participant", "Affected participant"],
] as const;
function Deliveries({ batch }: { batch: Batch }) {
  return (
    <div className={styles.deliveryList}>
      {batch.notification_deliveries.map((item) => (
        <div key={item.id}>
          <strong>
            {item.recipient_name || item.recipient_email || "Unknown recipient"}
          </strong>
          <span>
            {item.recipient_email} · {item.recipient_type}
          </span>
          <span>
            {item.channel} · {item.status}
            {item.error ? ` · ${item.error}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
export default function NotificationActionsPage() {
  const router = useRouter();
  const [actions, setActions] = useState<Action[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [tab, setTab] = useState<"actions" | "batches">("actions");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [audienceBatch, setAudienceBatch] = useState<Batch | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.replace("/signin?next=/backoffice/notifications/actions");
        return;
      }
      const response = await fetch("/api/backoffice/notification-actions", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok)
        setError(result.error || "Unable to load notification actions.");
      else {
        setActions(result.actions);
        setBatches(result.batches);
        setRules(result.notificationRules || []);
      }
    })();
  }, [router]);
  function update(key: string, changes: Partial<Action>) {
    setActions((current) =>
      current.map((action) =>
        action.action_key === key ? { ...action, ...changes } : action,
      ),
    );
  }
  async function save(action: Action) {
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch("/api/backoffice/notification-actions", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionKey: action.action_key,
        enabled: action.enabled,
        sendPush: action.send_push,
        sendEmail: action.send_email,
        recipientTypes: action.recipient_types,
        emailNotificationId: action.email_notification_id,
        suppressEmailWhenActive: action.suppress_email_when_active,
        activeWindowMinutes: action.active_window_minutes,
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Unable to save action.");
    else {
      setActions((current) =>
        current.map((item) =>
          item.action_key === action.action_key ? result.action : item,
        ),
      );
      setMessage(`${action.label} saved.`);
    }
  }
  function batchRow(batch: Batch) {
    return (
      <div key={batch.id} className={styles.savedBatch}>
        <button
          className={styles.batchHeader}
          onClick={() => setOpen(open === batch.id ? null : batch.id)}
        >
          <div>
            <strong>{new Date(batch.created_at).toLocaleString()}</strong>
            <span>
              {batch.recipient_count} recipients · batch {batch.id.slice(0, 8)}
            </span>
          </div>
          <span>
            {batch.status} · {batch.sent_count} sent · {batch.failed_count}{" "}
            failed
          </span>
        </button>
        {batch.email_notification_id ? (
          <small className={styles.batchTemplate}>
            Email:{" "}
            {rules.find((rule) => rule.id === batch.email_notification_id)
              ?.title || batch.email_notification_id}
          </small>
        ) : null}
        <button
          className={styles.rowAction}
          onClick={() => setAudienceBatch(batch)}
        >
          View everyone considered
        </button>
        {open === batch.id ? <Deliveries batch={batch} /> : null}
      </div>
    );
  }
  return (
    <main className={styles.backoffice}>
      <BackofficeRail active="notifications" />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Notification orchestration</p>
            <h1>Actions & delivery batches</h1>
            <span>
              Choose recipients, link an email notification and audit every
              delivery.
            </span>
          </div>
          <Link href="/backoffice#notifications" className={styles.exitLink}>
            Back to notifications
          </Link>
        </header>
        {error ? <p className={styles.inlineError}>{error}</p> : null}
        {message ? <p className={styles.inlineNotice}>{message}</p> : null}
        <div className={styles.notificationPageTabsBar}>
          <div className={styles.notificationPageTabs}>
            <button
              className={
                tab === "actions"
                  ? styles.notificationPageTabActive
                  : styles.notificationPageTab
              }
              onClick={() => setTab("actions")}
            >
              Action list
            </button>
            <button
              className={
                tab === "batches"
                  ? styles.notificationPageTabActive
                  : styles.notificationPageTab
              }
              onClick={() => setTab("batches")}
            >
              All delivery batches
            </button>
          </div>
        </div>
        {tab === "actions" ? (
          <div className={styles.actionCatalogue}>
            {actions.map((action) => {
              const ownBatches = batches.filter(
                (batch) => batch.action_key === action.action_key,
              );
              const selected = rules.find(
                (rule) => rule.id === action.email_notification_id,
              );
              return (
                <section key={action.action_key} className={styles.actionCard}>
                  <div className={styles.actionCardHeader}>
                    <div>
                      <span>{action.category}</span>
                      <strong>{action.label}</strong>
                      <code>{action.action_key}</code>
                    </div>
                    <label className={styles.actionEnabled}>
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={(e) =>
                          update(action.action_key, {
                            enabled: e.target.checked,
                          })
                        }
                      />{" "}
                      Enabled
                    </label>
                  </div>
                  <div className={styles.actionChecks}>
                    <label>
                      <input
                        type="checkbox"
                        checked={action.send_push}
                        onChange={(e) =>
                          update(action.action_key, {
                            send_push: e.target.checked,
                          })
                        }
                      />{" "}
                      Push
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={action.send_email}
                        onChange={(e) =>
                          update(action.action_key, {
                            send_email: e.target.checked,
                          })
                        }
                      />{" "}
                      Email
                    </label>
                    {recipientOptions.map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={action.recipient_types.includes(key)}
                          onChange={(e) =>
                            update(action.action_key, {
                              recipient_types: e.target.checked
                                ? [...action.recipient_types, key]
                                : action.recipient_types.filter(
                                    (value) => value !== key,
                                  ),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {action.send_email ? (
                    <label className={styles.linkedNotification}>
                      <span>Linked email notification</span>
                      <select
                        value={action.email_notification_id || ""}
                        onChange={(e) =>
                          update(action.action_key, {
                            email_notification_id: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Use action text</option>
                        {rules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.title} · {rule.templateMode} template
                          </option>
                        ))}
                      </select>
                      {selected ? (
                        <small>Subject: {selected.subject}</small>
                      ) : null}
                    </label>
                  ) : null}
                  {action.send_email ? (
                    <div className={styles.deliveryConditions}>
                      <label>
                        <input
                          type="checkbox"
                          checked={action.suppress_email_when_active}
                          onChange={(event) =>
                            update(action.action_key, {
                              suppress_email_when_active: event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>Don’t email active users</strong>
                          <small>
                            Push is still created; the email is recorded as
                            skipped.
                          </small>
                        </span>
                      </label>
                      <label>
                        <span>Active within</span>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={action.active_window_minutes}
                          onChange={(event) =>
                            update(action.action_key, {
                              active_window_minutes: Number(event.target.value),
                            })
                          }
                        />
                        <span>minutes</span>
                      </label>
                    </div>
                  ) : null}
                  <div className={styles.actionCardFooter}>
                    <button
                      className={styles.rowActionButton}
                      onClick={() => void save(action)}
                    >
                      Save action
                    </button>
                    <button
                      className={styles.rowAction}
                      onClick={() =>
                        setHistory(
                          history === action.action_key
                            ? null
                            : action.action_key,
                        )
                      }
                    >
                      Saved batches ({ownBatches.length})
                    </button>
                  </div>
                  {history === action.action_key ? (
                    <div className={styles.actionBatchHistory}>
                      {ownBatches.length ? (
                        ownBatches.map(batchRow)
                      ) : (
                        <p className={styles.emptyBatchHistory}>
                          No notification batches have been triggered for this
                          action yet.
                        </p>
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.batchList}>{batches.map(batchRow)}</div>
        )}
        {audienceBatch ? (
          <div
            className={styles.auditModalBackdrop}
            role="presentation"
            onMouseDown={() => setAudienceBatch(null)}
          >
            <section
              className={styles.auditModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="audience-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <p className={styles.kicker}>
                    Batch {audienceBatch.id.slice(0, 8)}
                  </p>
                  <h2 id="audience-title">Audience decision log</h2>
                  <span>
                    Everyone connected to the trip and why they were or were not
                    selected.
                  </span>
                </div>
                <button
                  className={styles.rowAction}
                  onClick={() => setAudienceBatch(null)}
                >
                  Close
                </button>
              </header>
              <div className={styles.auditPeopleList}>
                {audienceBatch.notification_audience_evaluations.length ? (
                  audienceBatch.notification_audience_evaluations.map(
                    (person) => {
                      const deliveries =
                        audienceBatch.notification_deliveries.filter(
                          (item) =>
                            (person.user_id &&
                              item.recipient_email === person.email) ||
                            (!person.user_id &&
                              item.recipient_email === person.email),
                        );
                      return (
                        <article key={person.id}>
                          <div>
                            <strong>
                              {person.name || person.email || "Unknown user"}
                            </strong>
                            <span>
                              {person.email || "No email"} ·{" "}
                              {person.connection_type} ·{" "}
                              {person.membership_status || "No membership"}
                            </span>
                          </div>
                          <span
                            className={
                              person.selected
                                ? styles.auditSelected
                                : styles.auditExcluded
                            }
                          >
                            {person.selected ? "Selected" : "Not selected"}
                          </span>
                          <p>{person.reason}</p>
                          {deliveries.length ? (
                            <ul>
                              {deliveries.map((delivery) => (
                                <li key={delivery.id}>
                                  {delivery.channel}: {delivery.status}
                                  {delivery.error ? ` — ${delivery.error}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      );
                    },
                  )
                ) : (
                  <p className={styles.emptyBatchHistory}>
                    This older batch does not have a saved audience evaluation.
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
