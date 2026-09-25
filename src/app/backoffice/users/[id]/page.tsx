"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "../../backoffice.module.css";

type AdminRow = Record<string, unknown>;

type UserDetail = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    plan: string;
    createdAt: string | null;
    lastSignInAt: string | null;
  };
  ownedTrips: AdminRow[];
  participantRows: AdminRow[];
  payments: AdminRow[];
  comments: AdminRow[];
  relatedTrips: AdminRow[];
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const stringValue = String(value);

  if (/^\d{4}-\d{2}-\d{2}T/.test(stringValue)) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(stringValue));
  }

  return stringValue;
}

function DataTable({
  title,
  rows,
  columns,
  linkColumn,
}: {
  title: string;
  rows: AdminRow[];
  columns: string[];
  linkColumn?: string;
}) {
  return (
    <section className={styles.detailSection}>
      <div className={styles.detailSectionHeader}>
        <strong>{title}</strong>
        <span>{rows.length} records</span>
      </div>
      <div className={styles.tableShell}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column.replaceAll("_", " ")}</th>
              ))}
              {linkColumn ? <th>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row.id ?? `${title}-${index}`)}>
                {columns.map((column) => (
                  <td key={column}>{formatValue(row[column])}</td>
                ))}
                {linkColumn ? (
                  <td>
                    {typeof row[linkColumn] === "string" ? (
                      <Link href={`/backoffice/trips/${row[linkColumn]}`} className={styles.rowAction}>
                        View trip
                      </Link>
                    ) : (
                      <span className={styles.subtleText}>No trip</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (linkColumn ? 1 : 0)} className={styles.emptyCell}>
                  No records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BackofficeUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      setLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setLoading(false);
        router.replace(`/signin?next=${encodeURIComponent(`/backoffice/users/${userId}`)}`);
        return;
      }

      const response = await fetch(`/api/backoffice/users/${userId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await response.json()) as UserDetail & { error?: string };

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setError(result.error || "Unable to load user detail.");
        setDetail(null);
        setLoading(false);
        return;
      }

      setDetail(result);
      setLoading(false);
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [router, userId]);

  const userStats = useMemo(() => {
    if (!detail) {
      return [];
    }

    return [
      ["Owned Trips", detail.ownedTrips.length],
      ["Participant Links", detail.participantRows.length],
      ["Payments", detail.payments.length],
      ["Comments", detail.comments.length],
      ["Related Trips", detail.relatedTrips.length],
    ];
  }, [detail]);

  async function getAdminToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  function updateUser(updates: Partial<UserDetail["user"]>) {
    setDetail((current) =>
      current
        ? {
            ...current,
            user: { ...current.user, ...updates },
          }
        : current,
    );
  }

  async function saveUser() {
    if (!detail) {
      return;
    }

    setSaving(true);
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before saving this user.");
      setSaving(false);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: detail.user.fullName,
        email: detail.user.email,
        role: detail.user.role,
        plan: detail.user.plan,
      }),
    });
    const result = (await response.json()) as { user?: UserDetail["user"]; error?: string };

    if (!response.ok || !result.user) {
      setMessage(result.error || "Unable to save this user.");
      setSaving(false);
      return;
    }

    updateUser(result.user);
    setMessage("User saved.");
    setSaving(false);
  }

  async function assumeUser() {
    setAssuming(true);
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before assuming this account.");
      setAssuming(false);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${userId}/assume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { assumeUrl?: string; userEmail?: string; error?: string };

    if (!response.ok || !result.assumeUrl) {
      setMessage(result.error || "Unable to create an account access link.");
      setAssuming(false);
      return;
    }

    window.open(result.assumeUrl, "_blank", "noopener,noreferrer");
    setMessage(`Opening ${result.userEmail ?? "the selected account"} in a new tab.`);
    setAssuming(false);
  }

  return (
    <main className={styles.backoffice}>
      <aside className={styles.rail}>
        <div className={styles.identity}>
          <span className={styles.identityMark}>
            <img src="/journi-backoffice-logo.png" alt="Journi" />
          </span>
          <div>
            <strong>Journi Admin</strong>
            <span>Backoffice</span>
          </div>
        </div>
        <Link href="/dashboard" className={styles.railExitLink}>
          Return to app
        </Link>
        <nav className={styles.nav} aria-label="Backoffice sections">
          <Link href="/backoffice" className={styles.navButton}>
            Dashboard
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Trips
          </Link>
          <Link href="/backoffice" className={styles.navButtonActive}>
            Users
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Payments
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Subscriptions
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Notifications
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Activity
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Documentation
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
            Testing
          </Link>
        </nav>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>User record</p>
            <h1>{detail ? detail.user.fullName || detail.user.email || "User detail" : "User detail"}</h1>
            <span>{detail ? detail.user.email || detail.user.id : "Loading operational data"}</span>
          </div>
          <Link href="/backoffice" className={styles.exitLink}>
            Back to backoffice
          </Link>
        </header>

        {loading ? (
          <section className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} />
            <div>
              <strong>Loading user detail</strong>
              <p>Collecting account and related trip records.</p>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className={styles.errorState}>
            <strong>User detail unavailable</strong>
            <p>{error}</p>
          </section>
        ) : null}

        {!loading && detail ? (
          <>
            {message ? <p className={styles.inlineNotice}>{message}</p> : null}

            <section className={styles.editPanel}>
              <div className={styles.editPanelHeader}>
                <div>
                  <strong>Edit user</strong>
                  <span>Account fields update Supabase Auth metadata.</span>
                </div>
                <div className={styles.rowActionGroup}>
                  <button
                    type="button"
                    className={styles.rowActionButton}
                    disabled={assuming}
                    onClick={() => void assumeUser()}
                  >
                    {assuming ? "Opening" : "Assume account"}
                  </button>
                  <button
                    type="button"
                    className={styles.rowActionButton}
                    disabled={saving}
                    onClick={() => void saveUser()}
                  >
                    {saving ? "Saving" : "Save user"}
                  </button>
                </div>
              </div>
              <div className={styles.editGrid}>
                <label>
                  <span>Full name</span>
                  <input
                    value={detail.user.fullName}
                    onChange={(event) => updateUser({ fullName: event.target.value })}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={detail.user.email}
                    onChange={(event) => updateUser({ email: event.target.value })}
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={detail.user.role || "member"}
                    onChange={(event) => updateUser({ role: event.target.value })}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </label>
                <label>
                  <span>Plan</span>
                  <select
                    value={detail.user.plan || "free"}
                    onChange={(event) => updateUser({ plan: event.target.value })}
                  >
                    <option value="free">Free</option>
                    <option value="trip_pass">Trip pass</option>
                    <option value="pro_organiser">Pro organiser</option>
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.statsGrid}>
              {userStats.map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <p>Connected records</p>
                </article>
              ))}
            </section>

            <section className={styles.detailGrid}>
              {[
                ["User ID", detail.user.id],
                ["Email", detail.user.email],
                ["Role", detail.user.role],
                ["Plan", detail.user.plan],
                ["Joined", detail.user.createdAt],
                ["Last sign-in", detail.user.lastSignInAt],
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{formatValue(value)}</strong>
                </article>
              ))}
            </section>

            <DataTable
              title="Owned Trips"
              rows={detail.ownedTrips}
              columns={["title", "destination", "status", "visibility", "starts_at", "ends_at", "created_at"]}
              linkColumn="id"
            />
            <DataTable
              title="Participant Links"
              rows={detail.participantRows}
              columns={["trip_id", "role", "status", "membership_status", "attendance_status", "created_at"]}
              linkColumn="trip_id"
            />
            <DataTable
              title="Payments"
              rows={detail.payments}
              columns={["trip_id", "status", "amount", "currency", "paid_at", "created_at"]}
              linkColumn="trip_id"
            />
            <DataTable
              title="Comments"
              rows={detail.comments}
              columns={["trip_id", "entity_type", "body", "created_at"]}
              linkColumn="trip_id"
            />
            <DataTable
              title="Related Trips"
              rows={detail.relatedTrips}
              columns={["title", "destination", "status", "visibility", "created_at"]}
              linkColumn="id"
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
