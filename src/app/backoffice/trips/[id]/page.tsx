"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "../../backoffice.module.css";

type AdminRow = Record<string, unknown>;

type ActivityLog = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  tableName: string | null;
  recordId: string | null;
  tripId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
};

type TripDetail = {
  trip: AdminRow;
  userEmailById: Record<string, string>;
  userNameById: Record<string, string>;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
  }>;
  participants: AdminRow[];
  hotels: AdminRow[];
  activities: AdminRow[];
  transport: AdminRow[];
  dining: AdminRow[];
  payments: AdminRow[];
  comments: AdminRow[];
  polls: AdminRow[];
  options: AdminRow[];
  pollOptions: AdminRow[];
  pollVotes: AdminRow[];
  activityLogs: ActivityLog[];
};

type TripDetailRowsKey = Exclude<keyof TripDetail, "trip" | "userEmailById" | "userNameById" | "activityLogs">;

type CellEditorState = {
  title: string;
  label: string;
  value: string;
  inputType?: "text" | "date";
  onSave: (value: string) => Promise<void>;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
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

function titleForRow(row: AdminRow, fallback: string) {
  return formatValue(row.title ?? row.name ?? row.provider ?? row.email ?? row.id ?? fallback);
}

function getRowString(row: AdminRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function normaliseLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(value: string | null | undefined) {
  if (value === "owner" || value === "active" || value === "accepted" || value === "going") {
    return styles.pillPositive;
  }

  if (value === "pending_approval" || value === "pending" || value === "maybe") {
    return styles.pillWarning;
  }

  return styles.pillNeutral;
}

function normaliseMembershipStatus(participant: AdminRow) {
  const membershipStatus = getRowString(participant, "membership_status");
  const status = getRowString(participant, "status");

  if (membershipStatus) {
    return membershipStatus;
  }

  if (status === "accepted") {
    return "active";
  }

  if (status === "pending") {
    return "pending_approval";
  }

  return status || "invited";
}

function getFirstText(row: AdminRow, keys: string[]) {
  for (const key of keys) {
    const value = getRowString(row, key);

    if (value) {
      return value;
    }
  }

  return "";
}

function getDateOnly(value: unknown) {
  const stringValue = typeof value === "string" ? value : "";

  return stringValue ? stringValue.slice(0, 10) : "";
}

function getDistinctLabels(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normaliseLabel(value))
        .filter((value) => value && value !== "Not set"),
    ),
  );
}

function EditableCell({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.editableCell} onClick={onClick}>
      <span>{children}</span>
      <small>Edit</small>
    </button>
  );
}

function DataTable({
  title,
  rows,
  columns,
  table,
  dataKey,
  editableColumns = [],
  onEditCell,
}: {
  title: string;
  rows: AdminRow[];
  columns: string[];
  table?: string;
  dataKey?: TripDetailRowsKey;
  editableColumns?: string[];
  onEditCell?: (
    dataKey: TripDetailRowsKey,
    table: string,
    row: AdminRow,
    column: string,
  ) => void;
}) {
  const editableColumnSet = new Set(editableColumns);

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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row.id ?? `${title}-${index}`)}>
                {columns.map((column) => (
                  <td key={column}>
                    {table && editableColumnSet.has(column) && typeof row.id === "string" ? (
                      <EditableCell
                        onClick={() => {
                          if (dataKey) {
                            onEditCell?.(dataKey, table, row, column);
                          }
                        }}
                      >
                        {formatValue(row[column])}
                      </EditableCell>
                    ) : (
                      formatValue(row[column])
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.emptyCell}>
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

export default function BackofficeTripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params.id;
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [cellEditorValue, setCellEditorValue] = useState("");
  const [participantUserId, setParticipantUserId] = useState("");
  const [participantRole, setParticipantRole] = useState("participant");
  const [participantMembershipStatus, setParticipantMembershipStatus] = useState("pending_approval");
  const [participantAttendanceStatus, setParticipantAttendanceStatus] = useState("");

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
        router.replace(`/signin?next=${encodeURIComponent(`/backoffice/trips/${tripId}`)}`);
        return;
      }

      const response = await fetch(`/api/backoffice/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await response.json()) as TripDetail & { error?: string };

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setError(result.error || "Unable to load trip detail.");
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
  }, [router, tripId]);

  const participantChat = useMemo(() => {
    if (!detail) {
      return [];
    }

    return detail.comments
      .filter((comment) => getRowString(comment, "entity_type") === "trip")
      .sort((a, b) => {
        const aTime = new Date(getRowString(a, "created_at")).getTime();
        const bTime = new Date(getRowString(b, "created_at")).getTime();

        return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
      });
  }, [detail]);

  const participantChatById = useMemo(
    () =>
      participantChat.reduce<Record<string, AdminRow>>((commentsById, comment) => {
        const id = getRowString(comment, "id");

        if (id) {
          commentsById[id] = comment;
        }

        return commentsById;
      }, {}),
    [participantChat],
  );

  const tripConnections = useMemo(() => {
    if (!detail) {
      return [];
    }

    const ownerId = getRowString(detail.trip, "owner_id");
    const ownerConnection = ownerId
      ? [
          {
            id: `owner:${ownerId}`,
            name: detail.userNameById?.[ownerId] || detail.userEmailById?.[ownerId] || "Trip owner",
            email: detail.userEmailById?.[ownerId] || ownerId,
            connectionType: "owner",
            membershipStatus: "owner",
            attendanceStatus: "",
            status: "owner",
            userId: ownerId,
          },
        ]
      : [];
    const participantConnections = detail.participants.map((participant, index) => {
      const userId = getRowString(participant, "user_id");
      const email =
        getRowString(participant, "email") ||
        (userId ? detail.userEmailById?.[userId] : "") ||
        "No email";
      const name =
        getRowString(participant, "full_name") ||
        (userId ? detail.userNameById?.[userId] : "") ||
        email;
      const membershipStatus = normaliseMembershipStatus(participant);
      const connectionType = getRowString(participant, "role") || "participant";

      return {
        id: getRowString(participant, "id") || `${userId || email}:${index}`,
        name,
        email,
        connectionType,
        membershipStatus,
        attendanceStatus: getRowString(participant, "attendance_status"),
        status: getRowString(participant, "status"),
        userId,
      };
    });

    return [...ownerConnection, ...participantConnections];
  }, [detail]);

  const participantUserOptions = useMemo(() => {
    if (!detail) {
      return [];
    }

    const connectedUserIds = new Set(
      tripConnections.map((connection) => connection.userId).filter(Boolean),
    );

    return detail.users.filter((user) => !connectedUserIds.has(user.id));
  }, [detail, tripConnections]);

  const builderSteps = useMemo(() => {
    if (!detail) {
      return [];
    }

    return [
      {
        key: "details",
        label: "Trip basics",
        eyebrow: "Destination and dates",
        complete: Boolean(detail.trip.title && detail.trip.destination),
        count: detail.trip.visibility ? normaliseLabel(getRowString(detail.trip, "visibility")) : "Not set",
      },
      {
        key: "hotels",
        label: "Hotels",
        eyebrow: "Accommodation shortlist",
        complete: detail.hotels.length > 0,
        count: `${detail.hotels.length} option${detail.hotels.length === 1 ? "" : "s"}`,
      },
      {
        key: "activities",
        label: "Activities",
        eyebrow: "Things to do",
        complete: detail.activities.length > 0,
        count: `${detail.activities.length} option${detail.activities.length === 1 ? "" : "s"}`,
      },
      {
        key: "transport",
        label: "Transport",
        eyebrow: "Getting around",
        complete: detail.transport.length > 0,
        count: `${detail.transport.length} option${detail.transport.length === 1 ? "" : "s"}`,
      },
      {
        key: "dining",
        label: "Dining",
        eyebrow: "Food plans",
        complete: detail.dining.length > 0,
        count: `${detail.dining.length} option${detail.dining.length === 1 ? "" : "s"}`,
      },
      {
        key: "finalise",
        label: "Review",
        eyebrow: "Participants and publish",
        complete: tripConnections.length > 1 || detail.trip.status === "published" || detail.trip.status === "active",
        count: `${tripConnections.length} connection${tripConnections.length === 1 ? "" : "s"}`,
      },
    ];
  }, [detail, tripConnections.length]);

  const builderPlanningSections = useMemo(() => {
    if (!detail) {
      return [];
    }

    return [
      {
        title: "Hotels",
        eyebrow: "Accommodation shortlist",
        rows: detail.hotels,
        titleKeys: ["name", "title"],
        subtitleKeys: ["location", "notes"],
        metaKeys: ["price_per_night", "currency", "rating"],
      },
      {
        title: "Activities",
        eyebrow: "Things to do",
        rows: detail.activities,
        titleKeys: ["title", "name"],
        subtitleKeys: ["location", "notes"],
        metaKeys: ["scheduled_for", "price", "currency"],
      },
      {
        title: "Transport",
        eyebrow: "Getting around",
        rows: detail.transport,
        titleKeys: ["mode", "provider", "title"],
        subtitleKeys: ["departure_location", "arrival_location", "notes"],
        metaKeys: ["departs_at", "arrives_at", "price"],
      },
      {
        title: "Dining",
        eyebrow: "Food plans",
        rows: detail.dining,
        titleKeys: ["name", "title"],
        subtitleKeys: ["location", "cuisine", "notes"],
        metaKeys: ["scheduled_for", "price_level"],
      },
    ];
  }, [detail]);

  async function getAdminToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  function updateTrip(updates: AdminRow) {
    setDetail((current) =>
      current
        ? {
            ...current,
            trip: { ...current.trip, ...updates },
          }
        : current,
    );
  }

  function updateRelatedRow(
    table: TripDetailRowsKey,
    id: string,
    updates: AdminRow,
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            [table]: current[table].map((row) =>
              row.id === id ? { ...row, ...updates } : row,
            ),
          }
        : current,
    );
  }

  async function saveTrip() {
    if (!detail) {
      return;
    }

    setSavingId("trip");
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before saving this trip.");
      setSavingId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/trips/${tripId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        updates: {
          title: detail.trip.title,
          destination: detail.trip.destination,
          description: detail.trip.description,
          status: detail.trip.status,
          visibility: detail.trip.visibility,
          starts_at: detail.trip.starts_at,
          ends_at: detail.trip.ends_at,
        },
      }),
    });
    const result = (await response.json()) as { trip?: AdminRow; error?: string };

    if (!response.ok || !result.trip) {
      setMessage(result.error || "Unable to save this trip.");
      setSavingId(null);
      return;
    }

    updateTrip(result.trip);
    setMessage("Trip saved.");
    setSavingId(null);
  }

  async function saveRecord(table: string, row: AdminRow) {
    if (typeof row.id !== "string") {
      setMessage("This row cannot be saved because it has no record ID.");
      return;
    }

    setSavingId(`${table}:${row.id}`);
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before saving this record.");
      setSavingId(null);
      return;
    }

    const response = await fetch("/api/backoffice/records", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ table, id: row.id, updates: row }),
    });
    const result = (await response.json()) as { record?: AdminRow; error?: string };

    if (!response.ok || !result.record) {
      setMessage(result.error || "Unable to save this record.");
      setSavingId(null);
      return;
    }

    const detailKeyByTable: Record<string, TripDetailRowsKey> = {
      trip_participants: "participants",
      hotels: "hotels",
      activities: "activities",
      transport: "transport",
      dining: "dining",
      payments: "payments",
      comments: "comments",
      polls: "polls",
      options: "options",
      poll_options: "pollOptions",
    };
    const detailKey = detailKeyByTable[table];

    if (detailKey) {
      updateRelatedRow(detailKey, row.id, result.record);
    }

    setMessage("Record saved.");
    setSavingId(null);
  }

  async function saveRecordCell(
    dataKey: TripDetailRowsKey,
    table: string,
    row: AdminRow,
    column: string,
    value: string,
  ) {
    if (typeof row.id !== "string") {
      setMessage("This row cannot be saved because it has no record ID.");
      return;
    }

    const nextRow = { ...row, [column]: value };

    setSavingId(`${table}:${row.id}:${column}`);
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before saving this record.");
      setSavingId(null);
      return;
    }

    const response = await fetch("/api/backoffice/records", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ table, id: row.id, updates: { [column]: value } }),
    });
    const result = (await response.json()) as { record?: AdminRow; error?: string };

    if (!response.ok || !result.record) {
      setMessage(result.error || "Unable to save this record.");
      setSavingId(null);
      return;
    }

    updateRelatedRow(dataKey, row.id, result.record ?? nextRow);
    setMessage("Record field saved.");
    setSavingId(null);
  }

  async function addParticipant() {
    if (!participantUserId) {
      setMessage("Choose a user to add as a participant.");
      return;
    }

    setSavingId("participant:create");
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before adding participants.");
      setSavingId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/trips/${tripId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: participantUserId,
        role: participantRole,
        membershipStatus: participantMembershipStatus,
        attendanceStatus: participantAttendanceStatus || null,
      }),
    });
    const result = (await response.json()) as { participant?: AdminRow; error?: string };

    if (!response.ok || !result.participant) {
      setMessage(result.error || "Unable to add this participant.");
      setSavingId(null);
      return;
    }

    setDetail((current) =>
      current
        ? {
            ...current,
            participants: [result.participant!, ...current.participants],
          }
        : current,
    );
    setParticipantUserId("");
    setParticipantRole("participant");
    setParticipantMembershipStatus("pending_approval");
    setParticipantAttendanceStatus("");
    setMessage("Participant added. You can now assume that account to test the trip relationship.");
    setSavingId(null);
  }

  async function assumeUser(userId: string) {
    setSavingId(`assume:${userId}`);
    setMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setMessage("Sign in with an admin account before assuming a participant.");
      setSavingId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${userId}/assume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ next: `/trips/${tripId}` }),
    });
    const result = (await response.json()) as { assumeUrl?: string; userEmail?: string; error?: string };

    if (!response.ok || !result.assumeUrl) {
      setMessage(result.error || "Unable to create an account access link.");
      setSavingId(null);
      return;
    }

    window.open(result.assumeUrl, "_blank", "noopener,noreferrer");
    setMessage(`Opening ${result.userEmail ?? "the selected participant"} in a new tab.`);
    setSavingId(null);
  }

  function openCellEditor(
    dataKey: TripDetailRowsKey,
    table: string,
    row: AdminRow,
    column: string,
  ) {
    const inputType =
      column.includes("_at") || column === "scheduled_for" || column === "closes_at"
        ? "date"
        : "text";
    const rawValue = row[column] === null || row[column] === undefined ? "" : String(row[column]);
    const value = inputType === "date" ? rawValue.slice(0, 10) : rawValue;

    setCellEditor({
      title: `Edit ${column.replaceAll("_", " ")}`,
      label: titleForRow(row, "Record"),
      value,
      inputType,
      onSave: (nextValue) => saveRecordCell(dataKey, table, row, column, nextValue),
    });
    setCellEditorValue(value);
  }

  async function saveCellEditor() {
    if (!cellEditor) {
      return;
    }

    await cellEditor.onSave(cellEditorValue);
    setCellEditor(null);
    setCellEditorValue("");
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
          <Link href="/backoffice" className={styles.navButtonActive}>
            Trips
          </Link>
          <Link href="/backoffice" className={styles.navButton}>
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
            <p className={styles.kicker}>Trip record</p>
            <h1>{detail ? titleForRow(detail.trip, "Trip") : "Trip detail"}</h1>
            <span>{detail ? formatValue(detail.trip.destination) : "Loading operational data"}</span>
          </div>
          <div className={styles.rowActionGroup}>
            <Link href={`/trips/${tripId}`} target="_blank" className={styles.exitLink}>
              Customer trip
            </Link>
            <Link href="/backoffice" className={styles.exitLink}>
              Back to backoffice
            </Link>
          </div>
        </header>

        {loading ? (
          <section className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} />
            <div>
              <strong>Loading trip detail</strong>
              <p>Collecting connected trip records.</p>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className={styles.errorState}>
            <strong>Trip detail unavailable</strong>
            <p>{error}</p>
          </section>
        ) : null}

        {!loading && detail ? (
          <>
            <div className={styles.tripDetailStack}>
              {message ? <p className={styles.inlineNotice}>{message}</p> : null}

              <section className={styles.tripBuilderPreview}>
                <div className={styles.tripBuilderHero}>
                  {getRowString(detail.trip, "cover_image_url") ? (
                    <img src={getRowString(detail.trip, "cover_image_url")} alt="" />
                  ) : (
                    <div className={styles.tripBuilderHeroFallback}>
                      {String(detail.trip.destination ?? "Journi").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.tripBuilderHeroCopy}>
                    <p className={styles.kicker}>Trip build view</p>
                    <h2>{formatValue(detail.trip.title)}</h2>
                    <div className={styles.tripBuilderMeta}>
                      <span>{formatValue(detail.trip.destination)}</span>
                      <span>
                        {getDateOnly(detail.trip.starts_at) || "No start date"} to{" "}
                        {getDateOnly(detail.trip.ends_at) || "No end date"}
                      </span>
                      <span>{normaliseLabel(getRowString(detail.trip, "status"))}</span>
                      <span>{normaliseLabel(getRowString(detail.trip, "visibility"))}</span>
                    </div>
                    <p>{formatValue(detail.trip.description)}</p>
                  </div>
                </div>

                <div className={styles.builderStepRail}>
                  {builderSteps.map((step, index) => (
                    <article
                      key={step.key}
                      className={step.complete ? styles.builderStepComplete : styles.builderStep}
                    >
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <small>{step.eyebrow}</small>
                        <em>{step.count}</em>
                      </div>
                    </article>
                  ))}
                </div>

                <div className={styles.builderSectionGrid}>
                  {builderPlanningSections.map((section) => (
                    <section key={section.title} className={styles.builderOptionSection}>
                      <div className={styles.detailSectionHeader}>
                        <div>
                          <strong>{section.title}</strong>
                          <span>{section.eyebrow}</span>
                        </div>
                        <span>{section.rows.length} records</span>
                      </div>
                      <div className={styles.tableShell}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Option</th>
                              <th>Location or detail</th>
                              <th>Extra detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.slice(0, 5).map((row, index) => {
                              const title = getFirstText(row, section.titleKeys) || `${section.title} option`;
                              const subtitles = section.subtitleKeys
                                .map((key) => getRowString(row, key))
                                .filter(Boolean);
                              const meta = section.metaKeys
                                .map((key) => {
                                  const value = row[key];
                                  return value === null || value === undefined || value === "" ? "" : formatValue(value);
                                })
                                .filter((value) => value && value !== "Not set");
                              const photoUrl = getRowString(row, "source_photo_url");

                              return (
                                <tr key={getRowString(row, "id") || `${section.title}-${index}`}>
                                  <td>
                                    <div className={styles.builderTableOption}>
                                      {photoUrl ? <img src={photoUrl} alt="" /> : <span />}
                                      <strong>{title}</strong>
                                    </div>
                                  </td>
                                  <td>{subtitles.length ? subtitles.slice(0, 2).join(", ") : "No supporting detail"}</td>
                                  <td>{meta.length ? meta.slice(0, 3).join(", ") : "No extra detail"}</td>
                                </tr>
                              );
                            })}
                            {section.rows.length === 0 ? (
                              <tr>
                                <td colSpan={3} className={styles.emptyCell}>
                                  No {section.title.toLowerCase()} have been added yet.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              </section>

              <section className={styles.editPanel}>
              <div className={styles.editPanelHeader}>
                <div>
                  <strong>Edit trip</strong>
                  <span>Changes save directly to the trip record.</span>
                </div>
                <button
                  type="button"
                  className={styles.rowActionButton}
                  disabled={savingId === "trip"}
                  onClick={() => void saveTrip()}
                >
                  {savingId === "trip" ? "Saving" : "Save trip"}
                </button>
              </div>
              <div className={styles.editGrid}>
                <label>
                  <span>Title</span>
                  <input
                    value={String(detail.trip.title ?? "")}
                    onChange={(event) => updateTrip({ title: event.target.value })}
                  />
                </label>
                <label>
                  <span>Destination</span>
                  <input
                    value={String(detail.trip.destination ?? "")}
                    onChange={(event) => updateTrip({ destination: event.target.value })}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={String(detail.trip.status ?? "")}
                    onChange={(event) => updateTrip({ status: event.target.value })}
                  >
                    <option value="">Not set</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span>Visibility</span>
                  <select
                    value={String(detail.trip.visibility ?? "private")}
                    onChange={(event) => updateTrip({ visibility: event.target.value })}
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label>
                  <span>Starts</span>
                  <input
                    type="date"
                    value={String(detail.trip.starts_at ?? "").slice(0, 10)}
                    onChange={(event) => updateTrip({ starts_at: event.target.value })}
                  />
                </label>
                <label>
                  <span>Ends</span>
                  <input
                    type="date"
                    value={String(detail.trip.ends_at ?? "").slice(0, 10)}
                    onChange={(event) => updateTrip({ ends_at: event.target.value })}
                  />
                </label>
                <label className={styles.editGridWide}>
                  <span>Description</span>
                  <textarea
                    value={String(detail.trip.description ?? "")}
                    onChange={(event) => updateTrip({ description: event.target.value })}
                  />
                </label>
              </div>
            </section>

            <section className={styles.chatPanel}>
              <div className={styles.detailSectionHeader}>
                <div>
                  <strong>Participants</strong>
                  <span>
                    {tripConnections.length} connected user{tripConnections.length === 1 ? "" : "s"} including owner and participant links
                  </span>
                </div>
              </div>

              <div className={styles.inlineAdminForm}>
                <label>
                  <span>User</span>
                  <select
                    value={participantUserId}
                    onChange={(event) => setParticipantUserId(event.target.value)}
                  >
                    <option value="">Choose a user</option>
                    {participantUserOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName || user.email} - {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Connection type</span>
                  <select
                    value={participantRole}
                    onChange={(event) => setParticipantRole(event.target.value)}
                  >
                    <option value="participant">Participant</option>
                    <option value="invited">Invited</option>
                    <option value="public_interest">Public interest</option>
                    <option value="organiser_guest">Organiser guest</option>
                  </select>
                </label>
                <label>
                  <span>Membership</span>
                  <select
                    value={participantMembershipStatus}
                    onChange={(event) => setParticipantMembershipStatus(event.target.value)}
                  >
                    <option value="pending_approval">Pending approval</option>
                    <option value="invited">Invited</option>
                    <option value="active">Active</option>
                    <option value="declined">Declined</option>
                  </select>
                </label>
                <label>
                  <span>Attendance</span>
                  <select
                    value={participantAttendanceStatus}
                    onChange={(event) => setParticipantAttendanceStatus(event.target.value)}
                  >
                    <option value="">Not set</option>
                    <option value="going">Going</option>
                    <option value="maybe">Maybe</option>
                    <option value="not_going">Not going</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.rowActionButton}
                  disabled={savingId === "participant:create" || !participantUserId}
                  onClick={() => void addParticipant()}
                >
                  {savingId === "participant:create" ? "Adding" : "Add participant"}
                </button>
              </div>

              <div className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Connection type</th>
                      <th>Membership</th>
                      <th>Attendance</th>
                      <th>Participant status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripConnections.map((connection) => (
                      <tr key={connection.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{connection.name}</strong>
                            <span>{connection.email}</span>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusTone(connection.connectionType)}>
                            {normaliseLabel(connection.connectionType)}
                          </span>
                        </td>
                        <td>
                          <span className={getStatusTone(connection.membershipStatus)}>
                            {normaliseLabel(connection.membershipStatus)}
                          </span>
                        </td>
                        <td>{normaliseLabel(connection.attendanceStatus)}</td>
                        <td>{normaliseLabel(connection.status)}</td>
                        <td>
                          {connection.userId ? (
                            <button
                              type="button"
                              className={styles.rowActionButton}
                              disabled={savingId === `assume:${connection.userId}`}
                              onClick={() => void assumeUser(connection.userId)}
                            >
                              {savingId === `assume:${connection.userId}` ? "Opening" : "Assume"}
                            </button>
                          ) : (
                            <span className={styles.subtleText}>No linked account</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {tripConnections.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyCell}>
                          No connected users found for this trip.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.chatPanel}>
              <div className={styles.detailSectionHeader}>
                <div>
                  <strong>Participant Chat</strong>
                  <span>
                    {participantChat.length} message{participantChat.length === 1 ? "" : "s"} between trip participants
                  </span>
                </div>
                <Link href={`/trips/${tripId}/discussion`} target="_blank" className={styles.rowAction}>
                  Open customer chat
                </Link>
              </div>

              <div className={styles.chatTranscript}>
                {participantChat.map((comment) => {
                  const id = getRowString(comment, "id");
                  const authorId = getRowString(comment, "author_id");
                  const parentId = getRowString(comment, "parent_comment_id");
                  const parent = parentId ? participantChatById[parentId] : null;
                  const authorName = authorId
                    ? detail.userNameById?.[authorId] || detail.userEmailById?.[authorId] || "Journi traveller"
                    : "System";
                  const authorEmail = authorId ? detail.userEmailById?.[authorId] : null;

                  return (
                    <article key={id || `${authorId}-${getRowString(comment, "created_at")}`} className={styles.chatMessage}>
                      <div className={styles.chatMessageHeader}>
                        <div>
                          <strong>{authorName}</strong>
                          <span>{authorEmail || "No linked account"}</span>
                        </div>
                        <time>{formatValue(comment.created_at)}</time>
                      </div>
                      {parent ? (
                        <div className={styles.chatReplyPreview}>
                          Replying to {detail.userNameById?.[getRowString(parent, "author_id")] || "traveller"}:{" "}
                          {getRowString(parent, "body").slice(0, 120)}
                        </div>
                      ) : null}
                      <p>{getRowString(comment, "body") || "No message body"}</p>
                    </article>
                  );
                })}

                {participantChat.length === 0 ? (
                  <section className={styles.errorState}>
                    <strong>No participant chat yet</strong>
                    <p>This trip does not have any shared discussion messages.</p>
                  </section>
                ) : null}
              </div>
            </section>

            <section className={styles.activityPanel}>
              <div className={styles.detailSectionHeader}>
                <div>
                  <strong>Trip activity</strong>
                  <span>
                    {detail.activityLogs.length} audit event{detail.activityLogs.length === 1 ? "" : "s"} linked to this trip
                  </span>
                </div>
              </div>

              <div className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Activity</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Table</th>
                      <th>Changed fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.activityLogs.map((log) => {
                      const changedKeys = Array.isArray(log.metadata.changed_keys)
                        ? log.metadata.changed_keys.join(", ")
                        : "";

                      return (
                        <tr key={log.id}>
                          <td>{formatValue(log.occurredAt)}</td>
                          <td>
                            <div className={styles.primaryCell}>
                              <strong>{log.summary}</strong>
                              <span>{log.tableName || "App event"}</span>
                            </div>
                          </td>
                          <td>{log.actorEmail || "System"}</td>
                          <td>
                            <span className={getStatusTone(log.action.includes("delete") ? "cancelled" : "active")}>
                              {log.action}
                            </span>
                          </td>
                          <td>{log.tableName || "App event"}</td>
                          <td>{changedKeys || "Not set"}</td>
                        </tr>
                      );
                    })}
                    {detail.activityLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyCell}>
                          No activity has been recorded against this trip yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <DataTable
              title="Hotels"
              rows={detail.hotels}
              columns={["name", "location", "price_per_night", "currency", "rating", "created_at"]}
              table="hotels"
              dataKey="hotels"
              editableColumns={["name", "location", "price_per_night", "currency", "rating"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Activities"
              rows={detail.activities}
              columns={["title", "location", "scheduled_for", "price", "currency", "created_at"]}
              table="activities"
              dataKey="activities"
              editableColumns={["title", "location", "scheduled_for", "price", "currency"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Transport"
              rows={detail.transport}
              columns={["mode", "provider", "departure_location", "arrival_location", "departs_at", "arrives_at", "price"]}
              table="transport"
              dataKey="transport"
              editableColumns={["mode", "provider", "departure_location", "arrival_location", "departs_at", "arrives_at", "price"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Dining"
              rows={detail.dining}
              columns={["name", "location", "scheduled_for", "cuisine", "price_level", "created_at"]}
              table="dining"
              dataKey="dining"
              editableColumns={["name", "location", "scheduled_for", "cuisine", "price_level"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Payments"
              rows={detail.payments}
              columns={["status", "amount", "currency", "paid_at", "created_at"]}
              table="payments"
              dataKey="payments"
              editableColumns={["status", "amount", "currency", "paid_at"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Comments"
              rows={detail.comments}
              columns={["entity_type", "body", "created_at"]}
              table="comments"
              dataKey="comments"
              editableColumns={["entity_type", "body"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Polls"
              rows={detail.polls}
              columns={["title", "description", "allows_multiple", "closes_at", "created_at"]}
              table="polls"
              dataKey="polls"
              editableColumns={["title", "description", "allows_multiple", "closes_at"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Options"
              rows={detail.options}
              columns={["category", "title", "description", "created_at"]}
              table="options"
              dataKey="options"
              editableColumns={["category", "title", "description"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Poll Options"
              rows={detail.pollOptions}
              columns={["label", "created_at"]}
              table="poll_options"
              dataKey="pollOptions"
              editableColumns={["label"]}
              onEditCell={openCellEditor}
            />
            <DataTable
              title="Poll Votes"
              rows={detail.pollVotes}
              columns={["voter_name", "created_at"]}
            />

              {cellEditor ? (
                <div className={styles.cellEditorBackdrop} role="presentation">
                  <section className={styles.cellEditor} role="dialog" aria-modal="true" aria-labelledby="cell-editor-title">
                    <div className={styles.cellEditorHeader}>
                      <div>
                        <strong id="cell-editor-title">{cellEditor.title}</strong>
                        <span>{cellEditor.label}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.cellEditorClose}
                        onClick={() => setCellEditor(null)}
                        aria-label="Close editor"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      type={cellEditor.inputType ?? "text"}
                      value={cellEditorValue}
                      onChange={(event) => setCellEditorValue(event.target.value)}
                      autoFocus
                    />
                    <div className={styles.cellEditorActions}>
                      <button type="button" className={styles.rowAction} onClick={() => setCellEditor(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        disabled={savingId !== null}
                        onClick={() => void saveCellEditor()}
                      >
                        {savingId ? "Saving" : "Save"}
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
