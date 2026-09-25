"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./backoffice.module.css";

type BackofficeStats = {
  users: number;
  trips: number;
  publicTrips: number;
  pendingApprovals: number;
  draftTrips: number;
  activeParticipants: number;
  records: number;
  payments: number;
  subscriptions: number;
  chatChannels: number;
  notificationRules: number;
  activityLogs: number;
};

type ParticipantSummary = {
  total: number;
  active: number;
  pendingApproval: number;
  invited: number;
  declined: number;
  going: number;
  maybe: number;
  notGoing: number;
};

type BackofficeTrip = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string | null;
  visibility: "private" | "public" | null;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  created_at: string | null;
  owner_id: string | null;
  ownerEmail: string;
  objectConnections: Record<string, number>;
  participantSummary: ParticipantSummary;
};

type BackofficeUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  plan: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type OperationalRecord = {
  id: string;
  table: string;
  label: string;
  tripId: string | null;
  tripTitle: string;
  detail: string;
  status: string;
  createdAt: string | null;
};

type PaymentRecord = {
  id: string;
  tripId: string | null;
  tripTitle: string;
  userId: string | null;
  userEmail: string;
  status: string | null;
  amount: number | null;
  currency: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

type SubscriptionRecord = {
  id: string;
  userId: string;
  userEmail: string;
  fullName: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
};

type ChatChannel = {
  id: string;
  tripId: string;
  tripTitle: string;
  destination: string | null;
  ownerEmail: string;
  visibility: "private" | "public" | null;
  status: string | null;
  participantCount: number;
  participantNames: string[];
  messageCount: number;
  latestMessage: string | null;
  latestMessageAt: string | null;
  latestAuthorId: string | null;
  latestAuthorName: string;
  latestAuthorEmail: string | null;
};

type NotificationRule = {
  id: string;
  title: string;
  triggerKey: string;
  audience: string;
  channel: string;
  sendTiming: string;
  subject: string;
  body: string;
  pushBody: string;
  customTemplate: string;
  templateMode: "global" | "custom";
  enabled: boolean;
  updatedAt: string | null;
  source: "database" | "default";
};

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

type CellEditorState = {
  title: string;
  label: string;
  value: string;
  inputType?: "text" | "email" | "date";
  options?: Array<{ label: string; value: string }>;
  onSave: (value: string) => Promise<void>;
};

type RecordActivityDrawer = {
  record: OperationalRecord;
  logs: ActivityLog[];
  loading: boolean;
  error: string | null;
};

type BackofficeView =
  | "dashboard"
  | "trips"
  | "users"
  | "records"
  | "payments"
  | "subscriptions"
  | "chats"
  | "notifications"
  | "activity"
  | "documentation"
  | "testing";

type DocumentationSection = {
  title: string;
  summary: string;
  steps: string[];
};

type ParticipantLifecycleItem = {
  label: string;
  timing: string;
  status: string;
  meaning: string;
  adminAction: string;
};

type TestingChecklistItem = {
  area: string;
  checks: string[];
};

type TestingLogEntry = {
  id: string;
  createdAt: string;
  area: string;
  status: "Pass" | "Fail" | "Blocked" | "Retest";
  tester: string;
  notes: string;
};

function escapeEmailText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createEmailTemplate(message: string) {
  const content = escapeEmailText(message).replaceAll("\n", "<br />");
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#10203f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dce4ee;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:24px 32px;background:#10203f;color:#ffffff;font-size:22px;font-weight:700;">Journi</td></tr>
          <tr><td style="padding:36px 32px;">
            <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#10203f;">${"{trip_title}"}</h1>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#475569;">${content}</p>
            <a href="${"{action_url}"}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#2c94f5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Open Journi</a>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">You are receiving this message because you are part of a trip on Journi.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function previewEmailTemplate(template: string) {
  return template
    .replaceAll("{first_name}", "Alex")
    .replaceAll("{participant_name}", "Alex Morgan")
    .replaceAll("{trip_title}", "Summer in Lisbon")
    .replaceAll("{action_url}", "#");
}

type BackofficeSummary = {
  accessMode: "development" | "restricted";
  stats: BackofficeStats;
  objectCounts: Record<string, number>;
  operationalRecords: OperationalRecord[];
  payments: PaymentRecord[];
  subscriptions: SubscriptionRecord[];
  chatChannels: ChatChannel[];
  notificationRules: NotificationRule[];
  users: BackofficeUser[];
  trips: BackofficeTrip[];
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTripDates(trip: BackofficeTrip) {
  if (!trip.starts_at && !trip.ends_at) {
    return "Unscheduled";
  }

  const startLabel = trip.starts_at ? formatDate(trip.starts_at) : null;
  const endLabel = trip.ends_at ? formatDate(trip.ends_at) : null;

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  return startLabel ?? endLabel ?? "Unscheduled";
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
  if (value === "active" || value === "public" || value === "admin") {
    return styles.pillPositive;
  }

  if (value === "draft" || value === "pending_approval") {
    return styles.pillWarning;
  }

  return styles.pillNeutral;
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(amount);
}

function getObjectConnectionTotal(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, value) => total + Number(value || 0), 0);
}

function getObjectConnectionSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([name, count]) => `${count} ${normaliseLabel(name).toLowerCase()}`)
    .join(" · ");
}

function getTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item) || "not_set";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
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

const documentationSections: DocumentationSection[] = [
  {
    title: "Account And Access",
    summary:
      "Journi uses Supabase Auth for accounts. Backoffice access is restricted to admin users, configured admin emails, or local development access.",
    steps: [
      "Users sign up or sign in through the public app using Supabase Auth.",
      "Plans, roles, and profile fields are stored on the user metadata attached to the account.",
      "Admins can edit name, email, role, and plan from the Backoffice Users table or user detail page.",
      "Assume account creates a server-generated magic link and opens the user session in a new tab.",
      "Only trusted admins should use account assumption, and each assumption is written to the activity log.",
    ],
  },
  {
    title: "Trip Creation",
    summary:
      "Organisers create trips as drafts, add planning options, then publish when they are ready for people to respond.",
    steps: [
      "The organiser starts a trip and adds core details such as title, destination, audience, dates, budget, and description.",
      "Hotels, activities, transport, and dining options are attached as planning records linked to the trip.",
      "Draft trips can be edited, cancelled, or deleted before they are published.",
      "Published trips should not be deleted because invites and participant links may already exist.",
      "Visibility controls whether a trip is private and invite-only or public and discoverable.",
    ],
  },
  {
    title: "Public Trips And Participants",
    summary:
      "Public trips can be found by travellers without an invite. Expressing interest creates a participant relationship that can be reviewed.",
    steps: [
      "Trips marked public appear on Explore Public Trips for other signed-in users.",
      "A traveller can register interest, which creates or updates a trip participant row.",
      "Interested travellers start as pending rather than confirmed.",
      "Organisers or admins can review participant status and attendance status.",
      "Accepted or active participants appear in the traveller's My Trips participant view.",
    ],
  },
  {
    title: "Voting And Discussion",
    summary:
      "Trip workspaces collect participant preference signals through polls, options, votes, and comments.",
    steps: [
      "Planning options are grouped by hotels, activities, transport, and dining.",
      "Polls connect users to those options so participants can vote on preferred choices.",
      "Votes can be added or removed by eligible users.",
      "Comments are linked to the trip or to a specific planning entity.",
      "Discussion and voting records are shown in trip detail pages and captured by the activity log.",
    ],
  },
  {
    title: "Payments And Subscriptions",
    summary:
      "Billing information is split between Stripe metadata on accounts and payment rows linked to users or trips.",
    steps: [
      "Subscription status and Stripe customer/subscription IDs can be read from user metadata.",
      "Payment rows show trip, user, status, amount, currency, and paid date where available.",
      "The Backoffice Payments and Subscriptions tabs are operational views for billing support.",
      "Payment rows can be edited by admins for supported fields, but Stripe should remain the source of truth for live billing.",
      "Billing-related changes are visible in the activity log when database rows change.",
    ],
  },
  {
    title: "Notifications",
    summary:
      "Notification rules define what message should be sent, who should receive it, and whether it goes by email, in-app, or both.",
    steps: [
      "Rules have a trigger key, audience, destination, send timing, subject, and message body.",
      "Enabled rules are intended to be used by future notification sending workflows.",
      "Admins can edit notification rules from the Notifications tab.",
      "Changing a notification rule creates activity log entries.",
      "The destination field separates Email, In-app, and Email + In-app delivery.",
    ],
  },
  {
    title: "Activity Log",
    summary:
      "The activity log is the audit trail for the app. It records database inserts, updates, deletes, and important admin actions.",
    steps: [
      "Database triggers write activity rows for core tables like trips, participants, planning options, votes, payments, and comments.",
      "Backoffice edits also write explicit admin activity summaries.",
      "Assume account actions are logged with the admin user and assumed user.",
      "Activity begins from the point the Supabase migration is applied; it does not recreate old history.",
      "Admins can search the Activity tab by actor, action, table, record, trip, or summary.",
    ],
  },
  {
    title: "Backoffice Editing",
    summary:
      "Backoffice tables stay readable by default. Editable cells open a small modal editor only when clicked.",
    steps: [
      "Editable table cells show a subtle Edit hint.",
      "Clicking an editable cell opens a small modal for that single field.",
      "Saving writes only that field through admin-protected API routes.",
      "Allowed fields are controlled by a whitelist so IDs, ownership, and unsafe columns are protected.",
      "Trip and user detail pages expose richer edit panels for common support tasks.",
    ],
  },
];

const participantLifecycle: ParticipantLifecycleItem[] = [
  {
    label: "Private invite sent",
    timing: "When an organiser adds a traveller by email on a private or draft trip.",
    status: "membership_status: invited, status: linked or invited",
    meaning:
      "The person has a relationship to the trip, but they have not confirmed whether they are taking part.",
    adminAction:
      "Check the participant row is connected to the correct trip and email. Use Assume from the trip view to open the trip as that user.",
  },
  {
    label: "Public interest requested",
    timing: "When a signed-in traveller finds a public trip and clicks to show interest.",
    status: "membership_status: pending_approval, status: pending",
    meaning:
      "The traveller can see the trip as a potential participant, but the organiser still needs to review them.",
    adminAction:
      "Review their name, email, request message, and activity. Approve or decline from the organiser trip workspace or update the row in backoffice.",
  },
  {
    label: "Participant approved",
    timing: "When the organiser accepts an invite response or approves public interest.",
    status: "membership_status: active, status: accepted",
    meaning:
      "The traveller is now an active participant. The trip should appear in My Trips under the participant view.",
    adminAction:
      "Confirm the participant can access the trip, vote where allowed, use the shared chat, and update attendance.",
  },
  {
    label: "Attendance captured",
    timing: "After a participant has access and chooses whether they are going.",
    status: "attendance_status: going, maybe, or not_going",
    meaning:
      "Attendance is separate from membership. A participant can be connected to the trip while still undecided.",
    adminAction:
      "Use attendance to understand trip readiness. Do not treat pending attendance as a broken participant link.",
  },
  {
    label: "Participant declined or removed",
    timing: "When a traveller declines, an organiser rejects interest, or an admin removes the connection.",
    status: "membership_status: declined or removed, status: declined",
    meaning:
      "The person should no longer have normal participant access to the private trip workspace.",
    adminAction:
      "Keep the record for audit history where possible. Check activity logs before manually changing it back.",
  },
];

const testingChecklist: TestingChecklistItem[] = [
  {
    area: "Authentication",
    checks: [
      "Sign up with a new free account.",
      "Sign in and sign out cleanly.",
      "Reset password flow sends the user to the right place.",
      "Plan and role metadata display correctly in the app and backoffice.",
    ],
  },
  {
    area: "Trip Creation",
    checks: [
      "Create a draft trip with destination, dates, audience, budget, and description.",
      "Generate an AI description and save the trip.",
      "Add multiple date options where supported.",
      "Confirm draft trips appear under My Trips for the organiser.",
    ],
  },
  {
    area: "Planning Options",
    checks: [
      "Search and add hotels, activities, transport, and dining.",
      "Carousel navigation works left and right.",
      "View all drawer opens above the nav and closes correctly.",
      "Cards stay consistent height across long and short content.",
    ],
  },
  {
    area: "Publishing And Visibility",
    checks: [
      "Set a trip to private and confirm it is invite-only.",
      "Set a trip to public and confirm it appears in Explore Public Trips.",
      "Confirm users cannot view private trips unless organiser or participant.",
      "Confirm published trips cannot be deleted like drafts.",
    ],
  },
  {
    area: "Participants",
    checks: [
      "Invite a traveller by email.",
      "Traveller accepts, declines, or marks attendance.",
      "Public-trip interest creates a pending participant row.",
      "Approved public participants appear in My Trips as participant trips.",
    ],
  },
  {
    area: "Voting And Discussion",
    checks: [
      "Vote on hotel, activity, transport, and dining options.",
      "Remove and change a vote.",
      "Post and delete comments where allowed.",
      "Confirm the page does not jump to the top after section actions.",
    ],
  },
  {
    area: "Payments And Subscriptions",
    checks: [
      "Free plan limits allow up to five travellers.",
      "Upgrade prompts only appear when a limit is actually reached.",
      "Payments tab shows payment rows and user/trip links.",
      "Subscriptions tab shows plan and Stripe identifiers where present.",
    ],
  },
  {
    area: "Backoffice",
    checks: [
      "Backoffice opens from account settings in a new tab.",
      "Dashboard, tables, detail pages, documentation, activity, and testing tabs load.",
      "Inline cell editing opens a small modal and saves the selected field.",
      "Assume account opens a user session and writes an activity log entry.",
    ],
  },
  {
    area: "Activity And Notifications",
    checks: [
      "Database changes create activity log entries after the migration is applied.",
      "Backoffice edits create clear admin activity summaries.",
      "Notification rule edits save destination, timing, subject, and body.",
      "Activity tab search finds actor, table, record, trip, and summary text.",
    ],
  },
  {
    area: "Responsive And Loading",
    checks: [
      "Backoffice side nav stays fixed while content scrolls.",
      "Loading states appear while data is being fetched.",
      "Mobile layout does not overlap text or controls.",
      "Tables scroll horizontally without breaking the page.",
    ],
  },
];

export default function BackofficePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<BackofficeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<BackofficeView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationChannel, setNotificationChannel] = useState<"push" | "email">("push");
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [emailTemplateView, setEmailTemplateView] = useState<"edit" | "preview">("edit");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [savingNotificationId, setSavingNotificationId] = useState<string | null>(null);
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [cellEditorValue, setCellEditorValue] = useState("");
  const [recordActivityDrawer, setRecordActivityDrawer] = useState<RecordActivityDrawer | null>(null);
  const [testingLog, setTestingLog] = useState<TestingLogEntry[]>([]);
  const [testArea, setTestArea] = useState(testingChecklist[0]?.area ?? "General");
  const [testStatus, setTestStatus] = useState<TestingLogEntry["status"]>("Pass");
  const [testTester, setTestTester] = useState("");
  const [testNotes, setTestNotes] = useState("");

  useEffect(() => {
    const requestedView = window.location.hash.slice(1) as BackofficeView;
    if (["dashboard", "trips", "users", "records", "payments", "subscriptions", "chats", "notifications", "activity", "documentation", "testing"].includes(requestedView)) {
      setActiveView(requestedView);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadBackoffice() {
      setLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setSummary(null);
        setLoading(false);
        router.replace("/signin?next=/backoffice");
        return;
      }

      const response = await fetch("/api/backoffice/summary", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = (await response.json()) as BackofficeSummary & { error?: string };

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setError(result.error || "Unable to load backoffice records.");
        setSummary(null);
        setLoading(false);
        return;
      }

      setSummary(result);
      setNotificationRules(result.notificationRules ?? []);
      setLoading(false);
    }

    void loadBackoffice();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    try {
      const storedLog = window.localStorage.getItem("journi-backoffice-testing-log");

      if (storedLog) {
        setTestingLog(JSON.parse(storedLog) as TestingLogEntry[]);
      }
    } catch {
      setTestingLog([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("journi-backoffice-testing-log", JSON.stringify(testingLog));
  }, [testingLog]);

  useEffect(() => {
    if (activeView !== "activity" || activityLogs.length > 0 || activityLoading) {
      return;
    }

    let mounted = true;

    async function loadActivity() {
      setActivityLoading(true);
      setActivityError(null);

      const token = await getAdminToken();

      if (!mounted) {
        return;
      }

      if (!token) {
        setActivityError("Sign in with an admin account before opening the activity log.");
        setActivityLoading(false);
        return;
      }

      const response = await fetch("/api/backoffice/activity", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { activityLogs?: ActivityLog[]; error?: string };

      if (!mounted) {
        return;
      }

      if (!response.ok || !result.activityLogs) {
        setActivityError(result.error || "Unable to load activity logs.");
        setActivityLoading(false);
        return;
      }

      setActivityLogs(result.activityLogs);
      setActivityLoading(false);
    }

    void loadActivity();

    return () => {
      mounted = false;
    };
  }, [activeView, activityLoading, activityLogs.length]);

  const filteredTrips = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.trips ?? [];
    }

    return summary.trips.filter((trip) =>
      [
        trip.title,
        trip.destination,
        trip.description,
        trip.status,
        trip.visibility,
        trip.ownerEmail,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.users ?? [];
    }

    return summary.users.filter((user) =>
      [user.email, user.fullName, user.role, user.plan]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredPayments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.payments ?? [];
    }

    return summary.payments.filter((payment) =>
      [
        payment.id,
        payment.tripTitle,
        payment.userEmail,
        payment.status,
        payment.currency,
        payment.stripeCustomerId,
        payment.stripeSubscriptionId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredOperationalRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.operationalRecords ?? [];
    }

    return summary.operationalRecords.filter((record) =>
      [
        record.id,
        record.table,
        record.label,
        record.tripTitle,
        record.detail,
        record.status,
        record.tripId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredSubscriptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.subscriptions ?? [];
    }

    return summary.subscriptions.filter((subscription) =>
      [
        subscription.id,
        subscription.userEmail,
        subscription.fullName,
        subscription.plan,
        subscription.status,
        subscription.stripeCustomerId,
        subscription.stripeSubscriptionId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredChatChannels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!summary || !query) {
      return summary?.chatChannels ?? [];
    }

    return summary.chatChannels.filter((channel) =>
      [
        channel.tripTitle,
        channel.destination,
        channel.ownerEmail,
        channel.status,
        channel.visibility,
        channel.latestMessage,
        channel.latestAuthorName,
        channel.latestAuthorEmail,
        ...channel.participantNames,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [searchTerm, summary]);

  const filteredNotificationRules = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return notificationRules;
    }

    return notificationRules.filter((rule) =>
      [
        rule.title,
        rule.triggerKey,
        rule.audience,
        rule.channel,
        rule.sendTiming,
        rule.subject,
        rule.body,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [notificationRules, searchTerm]);

  const visibleNotificationRules = useMemo(
    () =>
      filteredNotificationRules.filter((rule) => {
        const channel = rule.channel.toLowerCase();
        return notificationChannel === "email"
          ? channel.includes("email")
          : channel.includes("in-app") || channel.includes("push");
      }),
    [filteredNotificationRules, notificationChannel],
  );

  const selectedNotification = notificationRules.find(
    (rule) => rule.id === selectedNotificationId,
  ) ?? null;

  const filteredActivityLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return activityLogs;
    }

    return activityLogs.filter((log) =>
      [
        log.summary,
        log.action,
        log.actorEmail,
        log.tableName,
        log.recordId,
        log.tripId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [activityLogs, searchTerm]);

  const filteredDocumentationSections = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return documentationSections;
    }

    return documentationSections.filter((section) =>
      [section.title, section.summary, ...section.steps].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchTerm]);

  const filteredParticipantLifecycle = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return participantLifecycle;
    }

    return participantLifecycle.filter((item) =>
      [item.label, item.timing, item.status, item.meaning, item.adminAction].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchTerm]);

  const filteredTestingChecklist = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return testingChecklist;
    }

    return testingChecklist.filter((section) =>
      [section.area, ...section.checks].some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchTerm]);

  const filteredTestingLog = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return testingLog;
    }

    return testingLog.filter((entry) =>
      [entry.area, entry.status, entry.tester, entry.notes, entry.createdAt].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [searchTerm, testingLog]);

  const activeRecordCount =
    activeView === "trips"
      ? filteredTrips.length
      : activeView === "users"
        ? filteredUsers.length
        : activeView === "records"
          ? filteredOperationalRecords.length
          : activeView === "payments"
            ? filteredPayments.length
            : activeView === "subscriptions"
              ? filteredSubscriptions.length
              : activeView === "chats"
                ? filteredChatChannels.length
                : activeView === "notifications"
                  ? filteredNotificationRules.length
                  : activeView === "activity"
                    ? filteredActivityLogs.length
                    : activeView === "documentation"
                      ? filteredDocumentationSections.length + filteredParticipantLifecycle.length
                      : activeView === "testing"
                        ? filteredTestingChecklist.length + filteredTestingLog.length
                        : 0;

  const dashboard = useMemo(() => {
    const trips = summary?.trips ?? [];
    const users = summary?.users ?? [];
    const payments = summary?.payments ?? [];
    const subscriptions = summary?.subscriptions ?? [];
    const chatChannels = summary?.chatChannels ?? [];
    const totalTripParticipants = trips.reduce(
      (total, trip) => total + trip.participantSummary.total,
      0,
    );
    const totalPendingParticipants = trips.reduce(
      (total, trip) => total + trip.participantSummary.pendingApproval,
      0,
    );
    const totalGoing = trips.reduce((total, trip) => total + trip.participantSummary.going, 0);
    const totalMaybe = trips.reduce((total, trip) => total + trip.participantSummary.maybe, 0);
    const paymentTotalsByCurrency = payments.reduce<Record<string, number>>((totals, payment) => {
      if (payment.amount === null) {
        return totals;
      }

      const currency = payment.currency || "GBP";
      totals[currency] = (totals[currency] ?? 0) + payment.amount;
      return totals;
    }, {});
    const paidPaymentCount = payments.filter((payment) => payment.status === "paid").length;

    return {
      tripStatusCounts: countBy(trips, (trip) => trip.status),
      tripVisibilityCounts: countBy(trips, (trip) => trip.visibility),
      userPlanCounts: countBy(users, (user) => user.plan),
      subscriptionStatusCounts: countBy(subscriptions, (subscription) => subscription.status),
      paymentStatusCounts: countBy(payments, (payment) => payment.status),
      totalChatMessages: chatChannels.reduce((total, channel) => total + channel.messageCount, 0),
      activeChatChannels: chatChannels.filter((channel) => channel.messageCount > 0).length,
      paymentTotalsByCurrency,
      paidPaymentCount,
      pendingTripCount: trips.filter((trip) => trip.participantSummary.pendingApproval > 0).length,
      participantSnapshot: [
        ["Total linked", totalTripParticipants],
        ["Active", summary?.stats.activeParticipants ?? 0],
        ["Pending approval", totalPendingParticipants],
        ["Going", totalGoing],
        ["Maybe", totalMaybe],
      ],
      recentTrips: [...trips]
        .sort((a, b) => getTimestamp(b.created_at) - getTimestamp(a.created_at))
        .slice(0, 6),
      recentUsers: [...users]
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
        .slice(0, 6),
      recentPayments: [...payments]
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
        .slice(0, 6),
      recentChatChannels: [...chatChannels]
        .sort((a, b) => getTimestamp(b.latestMessageAt) - getTimestamp(a.latestMessageAt))
        .slice(0, 6),
      pendingTrips: trips
        .filter((trip) => trip.participantSummary.pendingApproval > 0)
        .slice(0, 6),
    };
  }, [summary]);

  function updateNotificationRule(id: string, updates: Partial<NotificationRule>) {
    setNotificationRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)),
    );
  }

  function updateTripRow(id: string, updates: Partial<BackofficeTrip>) {
    setSummary((current) =>
      current
        ? {
            ...current,
            trips: current.trips.map((trip) => (trip.id === id ? { ...trip, ...updates } : trip)),
          }
        : current,
    );
  }

  function updateUserRow(id: string, updates: Partial<BackofficeUser>) {
    setSummary((current) =>
      current
        ? {
            ...current,
            users: current.users.map((user) => (user.id === id ? { ...user, ...updates } : user)),
          }
        : current,
    );
  }

  async function getAdminToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  async function saveTripRow(trip: BackofficeTrip) {
    setSavingRecordId(`trip:${trip.id}`);
    setRecordMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setRecordMessage("Sign in with an admin account before saving trips.");
      setSavingRecordId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        updates: {
          title: trip.title,
          destination: trip.destination,
          status: trip.status,
          visibility: trip.visibility,
          starts_at: trip.starts_at,
          ends_at: trip.ends_at,
        },
      }),
    });
    const result = (await response.json()) as { trip?: Partial<BackofficeTrip>; error?: string };

    if (!response.ok || !result.trip) {
      setRecordMessage(result.error || "Unable to save this trip.");
      setSavingRecordId(null);
      return;
    }

    updateTripRow(trip.id, result.trip);
    setRecordMessage("Trip saved.");
    setSavingRecordId(null);
  }

  async function saveTripField(
    tripId: string,
    field: keyof Pick<
      BackofficeTrip,
      "title" | "destination" | "status" | "visibility" | "starts_at" | "ends_at"
    >,
    value: string,
  ) {
    setSavingRecordId(`trip:${tripId}:${String(field)}`);
    setRecordMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setRecordMessage("Sign in with an admin account before saving trips.");
      setSavingRecordId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/trips/${tripId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updates: { [field]: value } }),
    });
    const result = (await response.json()) as { trip?: Partial<BackofficeTrip>; error?: string };

    if (!response.ok || !result.trip) {
      setRecordMessage(result.error || "Unable to save this trip field.");
      setSavingRecordId(null);
      return;
    }

    updateTripRow(tripId, result.trip);
    setRecordMessage("Trip field saved.");
    setSavingRecordId(null);
  }

  async function saveUserRow(user: BackofficeUser) {
    setSavingRecordId(`user:${user.id}`);
    setRecordMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setRecordMessage("Sign in with an admin account before saving users.");
      setSavingRecordId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${user.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        plan: user.plan,
      }),
    });
    const result = (await response.json()) as { user?: BackofficeUser; error?: string };

    if (!response.ok || !result.user) {
      setRecordMessage(result.error || "Unable to save this user.");
      setSavingRecordId(null);
      return;
    }

    updateUserRow(user.id, result.user);
    setRecordMessage("User saved.");
    setSavingRecordId(null);
  }

  async function saveUserField(
    userId: string,
    field: keyof Pick<BackofficeUser, "fullName" | "email" | "role" | "plan">,
    value: string,
  ) {
    setSavingRecordId(`user:${userId}:${String(field)}`);
    setRecordMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setRecordMessage("Sign in with an admin account before saving users.");
      setSavingRecordId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ [field]: value }),
    });
    const result = (await response.json()) as { user?: BackofficeUser; error?: string };

    if (!response.ok || !result.user) {
      setRecordMessage(result.error || "Unable to save this user field.");
      setSavingRecordId(null);
      return;
    }

    updateUserRow(userId, result.user);
    setRecordMessage("User field saved.");
    setSavingRecordId(null);
  }

  function openCellEditor(editor: CellEditorState) {
    setCellEditor(editor);
    setCellEditorValue(editor.value);
  }

  async function saveCellEditor() {
    if (!cellEditor) {
      return;
    }

    await cellEditor.onSave(cellEditorValue);
    setCellEditor(null);
    setCellEditorValue("");
  }

  async function openRecordActivity(record: OperationalRecord) {
    setRecordActivityDrawer({
      record,
      logs: [],
      loading: true,
      error: null,
    });

    const token = await getAdminToken();

    if (!token) {
      setRecordActivityDrawer({
        record,
        logs: [],
        loading: false,
        error: "Sign in with an admin account before opening record activity.",
      });
      return;
    }

    const params = new URLSearchParams({
      table: record.table === "participants" ? "trip_participants" : record.table,
      recordId: record.id,
    });
    const response = await fetch(`/api/backoffice/activity?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { activityLogs?: ActivityLog[]; error?: string };

    setRecordActivityDrawer({
      record,
      logs: response.ok ? result.activityLogs ?? [] : [],
      loading: false,
      error: response.ok ? null : result.error || "Unable to load this record's activity.",
    });
  }

  function addTestingLogEntry() {
    if (!testNotes.trim()) {
      setRecordMessage("Add a short testing note before saving the log entry.");
      return;
    }

    setTestingLog((current) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        area: testArea,
        status: testStatus,
        tester: testTester.trim() || "Admin",
        notes: testNotes.trim(),
      },
      ...current,
    ]);
    setTestNotes("");
    setRecordMessage("Testing log entry added.");
  }

  function removeTestingLogEntry(id: string) {
    setTestingLog((current) => current.filter((entry) => entry.id !== id));
    setRecordMessage("Testing log entry removed.");
  }

  async function assumeUser(userId: string) {
    setSavingRecordId(`assume:${userId}`);
    setRecordMessage(null);

    const token = await getAdminToken();

    if (!token) {
      setRecordMessage("Sign in with an admin account before assuming an account.");
      setSavingRecordId(null);
      return;
    }

    const response = await fetch(`/api/backoffice/users/${userId}/assume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { assumeUrl?: string; userEmail?: string; error?: string };

    if (!response.ok || !result.assumeUrl) {
      setRecordMessage(result.error || "Unable to create an account access link.");
      setSavingRecordId(null);
      return;
    }

    window.open(result.assumeUrl, "_blank", "noopener,noreferrer");
    setRecordMessage(`Opening ${result.userEmail ?? "the selected account"} in a new tab.`);
    setSavingRecordId(null);
  }

  async function saveNotification(id: string) {
    const rule = notificationRules.find((item) => item.id === id);

    if (!rule) {
      return;
    }

    setSavingNotificationId(id);
    setNotificationError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setNotificationError("Sign in with an admin account before saving notifications.");
      setSavingNotificationId(null);
      return;
    }

    const response = await fetch("/api/backoffice/notifications", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rule),
    });
    const result = (await response.json()) as {
      notificationRule?: NotificationRule;
      error?: string;
    };

    if (!response.ok || !result.notificationRule) {
      setNotificationError(result.error || "Unable to save this notification rule.");
      setSavingNotificationId(null);
      return;
    }

    setNotificationRules((current) =>
      current.map((item) => (item.id === id ? result.notificationRule! : item)),
    );
    setSavingNotificationId(null);
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
          <button
            type="button"
            className={activeView === "dashboard" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeView === "trips" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("trips")}
          >
            Trips
          </button>
          <button
            type="button"
            className={activeView === "users" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("users")}
          >
            Users
          </button>
          <button
            type="button"
            className={activeView === "records" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("records")}
          >
            Connected Records
          </button>
          <button
            type="button"
            className={activeView === "payments" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("payments")}
          >
            Payments
          </button>
          <button
            type="button"
            className={activeView === "subscriptions" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("subscriptions")}
          >
            Subscriptions
          </button>
          <button
            type="button"
            className={activeView === "chats" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("chats")}
          >
            Chats
          </button>
          <button
            type="button"
            className={activeView === "notifications" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("notifications")}
          >
            Notifications
          </button>
          <button
            type="button"
            className={activeView === "activity" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("activity")}
          >
            Activity
          </button>
          <button
            type="button"
            className={activeView === "documentation" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("documentation")}
          >
            Documentation
          </button>
          <button
            type="button"
            className={activeView === "testing" ? styles.navButtonActive : styles.navButton}
            onClick={() => setActiveView("testing")}
          >
            Testing
          </button>
        </nav>

        <div className={styles.securityPanel}>
          <span>Access</span>
          <strong>{summary?.accessMode === "development" ? "Local admin" : "Restricted admin"}</strong>
          <p>Protected by authenticated server-side admin checks.</p>
        </div>
      </aside>

      <section className={styles.workspace}>
        {loading ? (
          <section className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} />
            <div>
              <strong>Loading records</strong>
              <p>Checking admin access and pulling the latest operational data.</p>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className={styles.errorState}>
            <strong>Backoffice locked</strong>
            <p>{error}</p>
          </section>
        ) : null}

        {!loading && summary ? (
          <>
            {activeView === "dashboard" ? (
              <>
                <section className={styles.dashboardHero}>
                  <div>
                    <p className={styles.kicker}>Backoffice dashboard</p>
                    <h1>Operations command centre</h1>
                    <span>
                      Monitor trips, participants, billing, notifications, testing, and audit activity from one admin view.
                    </span>
                  </div>
                  <div className={styles.dashboardHeroActions}>
                    <button type="button" className={styles.rowActionButton} onClick={() => setActiveView("records")}>
                      View connected records
                    </button>
                    <button type="button" className={styles.rowActionButton} onClick={() => setActiveView("activity")}>
                      View activity
                    </button>
                  </div>
                </section>

                <section className={styles.dashboardAttentionGrid}>
                  <article>
                    <span>Needs review</span>
                    <strong>{summary.stats.pendingApprovals}</strong>
                    <p>{dashboard.pendingTripCount} trips have pending participant interest</p>
                  </article>
                  <article>
                    <span>Draft pipeline</span>
                    <strong>{summary.stats.draftTrips}</strong>
                    <p>Trips still being prepared before publication</p>
                  </article>
                  <article>
                    <span>Community supply</span>
                    <strong>{summary.stats.publicTrips}</strong>
                    <p>Trips currently visible in public discovery</p>
                  </article>
                </section>

                <section className={styles.statsGrid}>
                  <article>
                    <span>Users</span>
                    <strong>{summary.stats.users}</strong>
                    <p>Registered accounts</p>
                  </article>
                  <article>
                    <span>Trips</span>
                    <strong>{summary.stats.trips}</strong>
                    <p>{summary.stats.draftTrips} draft trips</p>
                  </article>
                  <article>
                    <span>Public Trips</span>
                    <strong>{summary.stats.publicTrips}</strong>
                    <p>Visible to the community</p>
                  </article>
                  <article>
                    <span>Pending</span>
                    <strong>{summary.stats.pendingApprovals}</strong>
                    <p>Participant approvals</p>
                  </article>
                  <article>
                    <span>Active</span>
                    <strong>{summary.stats.activeParticipants}</strong>
                    <p>Approved participants</p>
                  </article>
                  <article>
                    <span>Objects</span>
                    <strong>{summary.stats.records}</strong>
                    <p>Planning and activity records</p>
                  </article>
                  <article>
                    <span>Payments</span>
                    <strong>{summary.stats.payments}</strong>
                    <p>Stripe and trip payment rows</p>
                  </article>
                  <article>
                    <span>Subscriptions</span>
                    <strong>{summary.stats.subscriptions}</strong>
                    <p>Billing relationships found</p>
                  </article>
                  <article>
                    <span>Chats</span>
                    <strong>{summary.stats.chatChannels}</strong>
                    <p>{dashboard.totalChatMessages} participant messages</p>
                  </article>
                  <article>
                    <span>Notifications</span>
                    <strong>{summary.stats.notificationRules}</strong>
                    <p>Message rules configured</p>
                  </article>
                  <article>
                    <span>Activity</span>
                    <strong>{summary.stats.activityLogs}</strong>
                    <p>Audit events captured</p>
                  </article>
                </section>

                <section className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <strong>Database objects</strong>
                      <span>{summary.stats.records} records shown</span>
                    </div>
                  </div>
                  <div className={styles.objectGrid}>
                    {Object.entries(summary.objectCounts).map(([name, count]) => (
                      <article key={name}>
                        <span>{normaliseLabel(name)}</span>
                        <strong>{count}</strong>
                      </article>
                    ))}
                  </div>
                </section>

                <section className={styles.dashboardColumns}>
                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Trip health</strong>
                        <span>Status and visibility mix</span>
                      </div>
                    </div>
                    <div className={styles.breakdownList}>
                      {Object.entries(dashboard.tripStatusCounts).map(([status, count]) => (
                        <div key={status}>
                          <span>{normaliseLabel(status)}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                      {Object.entries(dashboard.tripVisibilityCounts).map(([visibility, count]) => (
                        <div key={visibility}>
                          <span>{normaliseLabel(visibility)}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Participants</strong>
                        <span>{dashboard.pendingTripCount} trips need approval attention</span>
                      </div>
                    </div>
                    <div className={styles.breakdownList}>
                      {dashboard.participantSnapshot.map(([label, count]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Billing</strong>
                        <span>{dashboard.paidPaymentCount} paid payment rows</span>
                      </div>
                    </div>
                    <div className={styles.breakdownList}>
                      {Object.entries(dashboard.paymentTotalsByCurrency).map(([currency, total]) => (
                        <div key={currency}>
                          <span>Total {currency.toUpperCase()}</span>
                          <strong>{formatMoney(total, currency)}</strong>
                        </div>
                      ))}
                      {Object.keys(dashboard.paymentTotalsByCurrency).length === 0 ? (
                        <div>
                          <span>Total revenue</span>
                          <strong>{formatMoney(null, "GBP")}</strong>
                        </div>
                      ) : null}
                      {Object.entries(dashboard.paymentStatusCounts).map(([status, count]) => (
                        <div key={status}>
                          <span>{normaliseLabel(status)}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Subscriptions</strong>
                        <span>Plans and billing status</span>
                      </div>
                    </div>
                    <div className={styles.breakdownList}>
                      {Object.entries(dashboard.userPlanCounts).map(([plan, count]) => (
                        <div key={plan}>
                          <span>{normaliseLabel(plan)}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                      {Object.entries(dashboard.subscriptionStatusCounts).map(([status, count]) => (
                        <div key={status}>
                          <span>{normaliseLabel(status)}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <section className={styles.dashboardColumns}>
                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Recent trips</strong>
                        <span>Newest trip records</span>
                      </div>
                      <button type="button" className={styles.miniAction} onClick={() => setActiveView("trips")}>
                        View all
                      </button>
                    </div>
                    <div className={styles.compactList}>
                      {dashboard.recentTrips.map((trip) => (
                        <Link key={trip.id} href={`/backoffice/trips/${trip.id}`}>
                          <strong>{trip.title}</strong>
                          <span>{trip.destination || "No destination"} · {formatDate(trip.created_at)}</span>
                        </Link>
                      ))}
                    </div>
                  </article>

                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Recent users</strong>
                        <span>Newest registered accounts</span>
                      </div>
                      <button type="button" className={styles.miniAction} onClick={() => setActiveView("users")}>
                        View all
                      </button>
                    </div>
                    <div className={styles.compactList}>
                      {dashboard.recentUsers.map((user) => (
                        <Link key={user.id} href={`/backoffice/users/${user.id}`}>
                          <strong>{user.fullName || user.email || "Unnamed user"}</strong>
                          <span>{normaliseLabel(user.plan)} · {formatDate(user.createdAt)}</span>
                        </Link>
                      ))}
                    </div>
                  </article>
                </section>

                <section className={styles.dashboardColumns}>
                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Approval watchlist</strong>
                        <span>Trips with pending participant interest</span>
                      </div>
                    </div>
                    <div className={styles.compactList}>
                      {dashboard.pendingTrips.map((trip) => (
                        <Link key={trip.id} href={`/backoffice/trips/${trip.id}`}>
                          <strong>{trip.title}</strong>
                          <span>
                            {trip.participantSummary.pendingApproval} pending · {trip.ownerEmail}
                          </span>
                        </Link>
                      ))}
                      {dashboard.pendingTrips.length === 0 ? (
                        <p className={styles.emptyMini}>No trips are waiting for participant approval.</p>
                      ) : null}
                    </div>
                  </article>

                  <article className={styles.dashboardPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Recent payments</strong>
                        <span>Latest payment records</span>
                      </div>
                      <button type="button" className={styles.miniAction} onClick={() => setActiveView("payments")}>
                        View all
                      </button>
                    </div>
                    <div className={styles.compactList}>
                      {dashboard.recentPayments.map((payment) => (
                        <Link
                          key={payment.id}
                          href={
                            payment.tripId
                              ? `/backoffice/trips/${payment.tripId}`
                              : payment.userId
                                ? `/backoffice/users/${payment.userId}`
                                : "/backoffice"
                          }
                        >
                          <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                          <span>{payment.userEmail} · {normaliseLabel(payment.status)}</span>
                        </Link>
                      ))}
                      {dashboard.recentPayments.length === 0 ? (
                        <p className={styles.emptyMini}>No payment rows found yet.</p>
                      ) : null}
                    </div>
                  </article>
                </section>
              </>
            ) : null}

            {activeView !== "dashboard" ? (
              <section className={styles.toolbar}>
                <div>
                  <strong>
                    {activeView === "trips"
                      ? "Trip records"
                      : activeView === "users"
                        ? "User records"
                        : activeView === "records"
                          ? "Connected trip records"
                          : activeView === "payments"
                            ? "Payment records"
                            : activeView === "subscriptions"
                              ? "Subscription records"
                              : activeView === "chats"
                                ? "Chat channels"
                                : activeView === "notifications"
                                  ? "Notification rules"
                                  : activeView === "activity"
                                    ? "Activity log"
                                    : activeView === "documentation"
                                      ? "Documentation"
                                      : "Testing"}
                  </strong>
                  <span>{activeRecordCount} records shown</span>
                </div>

                <label className={styles.searchBox}>
                  <span>Search records</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={
                      activeView === "trips"
                        ? "Trip, destination, owner, status"
                        : activeView === "users"
                          ? "Name, email, role, plan"
                          : activeView === "records"
                            ? "Table, object, trip, status"
                            : activeView === "payments"
                            ? "Payment, trip, user, Stripe ID, status"
                              : activeView === "subscriptions"
                                ? "User, plan, status, Stripe ID"
                                : activeView === "chats"
                                  ? "Trip, participant, owner, latest message"
                                  : activeView === "notifications"
                                    ? "Trigger, audience, subject, message"
                                    : activeView === "activity"
                                      ? "Actor, action, table, record, summary"
                                      : activeView === "documentation"
                                        ? "Process, access, trips, billing, notifications"
                                        : "Test area, status, tester, note"
                    }
                  />
                </label>
              </section>
            ) : null}

            {recordMessage ? <p className={styles.inlineNotice}>{recordMessage}</p> : null}

            {activeView === "trips" ? (
              <section className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Trip</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Visibility</th>
                      <th>Dates</th>
                      <th>Participants</th>
                      <th>Connected objects</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrips.map((trip) => (
                      <tr key={trip.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <EditableCell
                              onClick={() =>
                                openCellEditor({
                                  title: "Edit trip title",
                                  label: "Trip title",
                                  value: trip.title,
                                  onSave: (value) => saveTripField(trip.id, "title", value),
                                })
                              }
                            >
                              <strong>{trip.title}</strong>
                            </EditableCell>
                            <EditableCell
                              onClick={() =>
                                openCellEditor({
                                  title: "Edit destination",
                                  label: "Destination",
                                  value: trip.destination ?? "",
                                  onSave: (value) => saveTripField(trip.id, "destination", value),
                                })
                              }
                            >
                              {trip.destination || "No destination"}
                            </EditableCell>
                          </div>
                        </td>
                        <td>{trip.ownerEmail}</td>
                        <td>
                          <EditableCell
                            onClick={() =>
                              openCellEditor({
                                title: "Edit trip status",
                                label: "Status",
                                value: trip.status ?? "",
                                options: [
                                  { label: "Not set", value: "" },
                                  { label: "Draft", value: "draft" },
                                  { label: "Published", value: "published" },
                                  { label: "Active", value: "active" },
                                  { label: "Cancelled", value: "cancelled" },
                                ],
                                onSave: (value) => saveTripField(trip.id, "status", value),
                              })
                            }
                          >
                            <span className={getStatusTone(trip.status)}>{normaliseLabel(trip.status)}</span>
                          </EditableCell>
                        </td>
                        <td>
                          <EditableCell
                            onClick={() =>
                              openCellEditor({
                                title: "Edit trip visibility",
                                label: "Visibility",
                                value: trip.visibility ?? "private",
                                options: [
                                  { label: "Private", value: "private" },
                                  { label: "Public", value: "public" },
                                ],
                                onSave: (value) =>
                                  saveTripField(
                                    trip.id,
                                    "visibility",
                                    value as NonNullable<BackofficeTrip["visibility"]>,
                                  ),
                              })
                            }
                          >
                            <span className={getStatusTone(trip.visibility)}>
                              {normaliseLabel(trip.visibility)}
                            </span>
                          </EditableCell>
                        </td>
                        <td>
                          <div className={styles.inlineDateFields}>
                            <EditableCell
                              onClick={() =>
                                openCellEditor({
                                  title: "Edit start date",
                                  label: "Start date",
                                  value: trip.starts_at?.slice(0, 10) ?? "",
                                  inputType: "date",
                                  onSave: (value) => saveTripField(trip.id, "starts_at", value),
                                })
                              }
                            >
                              {trip.starts_at ? formatDate(trip.starts_at) : "No start date"}
                            </EditableCell>
                            <EditableCell
                              onClick={() =>
                                openCellEditor({
                                  title: "Edit end date",
                                  label: "End date",
                                  value: trip.ends_at?.slice(0, 10) ?? "",
                                  inputType: "date",
                                  onSave: (value) => saveTripField(trip.id, "ends_at", value),
                                })
                              }
                            >
                              {trip.ends_at ? formatDate(trip.ends_at) : "No end date"}
                            </EditableCell>
                          </div>
                        </td>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>
                              1 owner · {trip.participantSummary.total} participant
                              {trip.participantSummary.total === 1 ? "" : "s"}
                            </strong>
                            <span>
                              Owner: {trip.ownerEmail}
                            </span>
                            <span>
                              {trip.participantSummary.active} active ·{" "}
                              {trip.participantSummary.pendingApproval} pending ·{" "}
                              {trip.participantSummary.invited} invited
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{getObjectConnectionTotal(trip.objectConnections)} linked records</strong>
                            <span>{getObjectConnectionSummary(trip.objectConnections) || "No connected objects"}</span>
                          </div>
                        </td>
                        <td>{formatDate(trip.created_at)}</td>
                        <td>
                          <div className={styles.rowActionGroup}>
                            <Link href={`/backoffice/trips/${trip.id}`} className={styles.rowAction}>
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredTrips.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={styles.emptyCell}>
                          No trip records match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "users" ? (
              <section className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Plan</th>
                      <th>Joined</th>
                      <th>Last sign-in</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <EditableCell
                              onClick={() =>
                                openCellEditor({
                                  title: "Edit full name",
                                  label: "Full name",
                                  value: user.fullName,
                                  onSave: (value) => saveUserField(user.id, "fullName", value),
                                })
                              }
                            >
                              <strong>{user.fullName || "Unnamed user"}</strong>
                            </EditableCell>
                          </div>
                        </td>
                        <td>
                          <EditableCell
                            onClick={() =>
                              openCellEditor({
                                title: "Edit email",
                                label: "Email",
                                value: user.email,
                                inputType: "email",
                                onSave: (value) => saveUserField(user.id, "email", value),
                              })
                            }
                          >
                            {user.email || "No email"}
                          </EditableCell>
                        </td>
                        <td>
                          <EditableCell
                            onClick={() =>
                              openCellEditor({
                                title: "Edit role",
                                label: "Role",
                                value: user.role || "member",
                                options: [
                                  { label: "Member", value: "member" },
                                  { label: "Admin", value: "admin" },
                                  { label: "Super admin", value: "super_admin" },
                                ],
                                onSave: (value) => saveUserField(user.id, "role", value),
                              })
                            }
                          >
                            <span className={getStatusTone(user.role)}>{normaliseLabel(user.role)}</span>
                          </EditableCell>
                        </td>
                        <td>
                          <EditableCell
                            onClick={() =>
                              openCellEditor({
                                title: "Edit plan",
                                label: "Plan",
                                value: user.plan || "free",
                                options: [
                                  { label: "Free", value: "free" },
                                  { label: "Trip pass", value: "trip_pass" },
                                  { label: "Pro organiser", value: "pro_organiser" },
                                ],
                                onSave: (value) => saveUserField(user.id, "plan", value),
                              })
                            }
                          >
                            {normaliseLabel(user.plan)}
                          </EditableCell>
                        </td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>{formatDate(user.lastSignInAt)}</td>
                        <td>
                          <div className={styles.rowActionGroup}>
                            <button
                              type="button"
                              className={styles.rowActionButton}
                              disabled={savingRecordId === `assume:${user.id}`}
                              onClick={() => void assumeUser(user.id)}
                            >
                              {savingRecordId === `assume:${user.id}` ? "Opening" : "Assume"}
                            </button>
                            <Link href={`/backoffice/users/${user.id}`} className={styles.rowAction}>
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.emptyCell}>
                          No user records match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "records" ? (
              <>
                <section className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <strong>Connected records by type</strong>
                      <span>{summary.stats.records} records across trip objects</span>
                    </div>
                  </div>
                  <div className={styles.objectGrid}>
                    {Object.entries(summary.objectCounts).map(([name, count]) => (
                      <article key={name}>
                        <span>{normaliseLabel(name)}</span>
                        <strong>{count}</strong>
                      </article>
                    ))}
                  </div>
                </section>

                <section className={styles.tableShell}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Object</th>
                        <th>Type</th>
                        <th>Trip</th>
                        <th>Detail</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOperationalRecords.map((record) => (
                        <tr key={`${record.table}-${record.id}`}>
                          <td>
                            <div className={styles.primaryCell}>
                              <strong>{record.label || "Untitled record"}</strong>
                              <span>{record.tripTitle}</span>
                            </div>
                          </td>
                          <td>{normaliseLabel(record.table)}</td>
                          <td>{record.tripTitle}</td>
                          <td>{record.detail || "Not set"}</td>
                          <td>
                            <span className={getStatusTone(record.status)}>
                              {normaliseLabel(record.status)}
                            </span>
                          </td>
                          <td>{formatDate(record.createdAt)}</td>
                          <td>
                            <div className={styles.rowActionGroup}>
                              <button
                                type="button"
                                className={styles.rowActionButton}
                                onClick={() => void openRecordActivity(record)}
                              >
                                Activity
                              </button>
                              {record.tripId ? (
                                <Link href={`/backoffice/trips/${record.tripId}`} className={styles.rowAction}>
                                  View trip
                                </Link>
                              ) : (
                                <span className={styles.subtleText}>No trip</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredOperationalRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={styles.emptyCell}>
                            No connected records match this search.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </section>
              </>
            ) : null}

            {activeView === "payments" ? (
              <section className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Trip</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.userEmail}</td>
                        <td>{payment.tripTitle}</td>
                        <td>
                          <span className={getStatusTone(payment.status)}>
                            {normaliseLabel(payment.status)}
                          </span>
                        </td>
                        <td>{formatMoney(payment.amount, payment.currency)}</td>
                        <td>{formatDate(payment.paidAt)}</td>
                        <td>{formatDate(payment.createdAt)}</td>
                        <td>
                          {payment.tripId ? (
                            <Link href={`/backoffice/trips/${payment.tripId}`} className={styles.rowAction}>
                              View trip
                            </Link>
                          ) : payment.userId ? (
                            <Link href={`/backoffice/users/${payment.userId}`} className={styles.rowAction}>
                              View user
                            </Link>
                          ) : (
                            <span className={styles.subtleText}>No link</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.emptyCell}>
                          No payment records match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "subscriptions" ? (
              <section className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Subscriber</th>
                      <th>Status</th>
                      <th>Plan</th>
                      <th>Joined</th>
                      <th>Last sign-in</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscriptions.map((subscription) => (
                      <tr key={subscription.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{subscription.fullName || subscription.userEmail}</strong>
                            <span>{subscription.userEmail}</span>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusTone(subscription.status)}>
                            {normaliseLabel(subscription.status)}
                          </span>
                        </td>
                        <td>{normaliseLabel(subscription.plan)}</td>
                        <td>{formatDate(subscription.createdAt)}</td>
                        <td>{formatDate(subscription.lastSignInAt)}</td>
                        <td>
                          <Link href={`/backoffice/users/${subscription.userId}`} className={styles.rowAction}>
                            View user
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {filteredSubscriptions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyCell}>
                          No subscription records match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "chats" ? (
              <section className={styles.tableShell}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Visibility</th>
                      <th>Participants</th>
                      <th>Messages</th>
                      <th>Latest message</th>
                      <th>Latest author</th>
                      <th>Updated</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChatChannels.map((channel) => (
                      <tr key={channel.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{channel.tripTitle}</strong>
                            <span>{channel.destination || "No destination"}</span>
                          </div>
                        </td>
                        <td>{channel.ownerEmail}</td>
                        <td>
                          <span className={getStatusTone(channel.status)}>
                            {normaliseLabel(channel.status)}
                          </span>
                        </td>
                        <td>
                          <span className={getStatusTone(channel.visibility)}>
                            {normaliseLabel(channel.visibility)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{channel.participantCount} users</strong>
                            <span>
                              {channel.participantNames.length
                                ? channel.participantNames.join(", ")
                                : "No participants yet"}
                            </span>
                          </div>
                        </td>
                        <td>{channel.messageCount}</td>
                        <td>
                          {channel.latestMessage
                            ? channel.latestMessage.length > 120
                              ? `${channel.latestMessage.slice(0, 120)}...`
                              : channel.latestMessage
                            : "No messages yet"}
                        </td>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{channel.latestAuthorName}</strong>
                            <span>{channel.latestAuthorEmail || "No linked user"}</span>
                          </div>
                        </td>
                        <td>{formatDateTime(channel.latestMessageAt)}</td>
                        <td>
                          <div className={styles.rowActionGroup}>
                            <Link href={`/backoffice/trips/${channel.tripId}`} className={styles.rowAction}>
                              View trip
                            </Link>
                            <Link
                              href={`/trips/${channel.tripId}/discussion`}
                              target="_blank"
                              className={styles.rowAction}
                            >
                              Open chat
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredChatChannels.length === 0 ? (
                      <tr>
                        <td colSpan={10} className={styles.emptyCell}>
                          No chat channels match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "notifications" ? (
              <section className={styles.notificationSection}>
                <div className={styles.notificationChannelHeader}>
                  <div>
                    <p className={styles.kicker}>Delivery channel</p>
                    <h2>
                      {notificationChannel === "push"
                        ? "Push notifications"
                        : "Email notifications"}
                    </h2>
                    <span>
                      {notificationChannel === "push"
                        ? "Messages shown to travellers inside Journi and through enabled device notifications."
                        : "Messages delivered to travellers and organisers by email."}
                    </span>
                  </div>
                  <div className={styles.notificationChannelTabs} role="tablist" aria-label="Notification channel">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={notificationChannel === "push"}
                      className={notificationChannel === "push" ? styles.notificationChannelTabActive : styles.notificationChannelTab}
                      onClick={() => setNotificationChannel("push")}
                    >
                      Push
                      <strong>{filteredNotificationRules.filter((rule) => /in-app|push/i.test(rule.channel)).length}</strong>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={notificationChannel === "email"}
                      className={notificationChannel === "email" ? styles.notificationChannelTabActive : styles.notificationChannelTab}
                      onClick={() => setNotificationChannel("email")}
                    >
                      Email
                      <strong>{filteredNotificationRules.filter((rule) => /email/i.test(rule.channel)).length}</strong>
                    </button>
                  </div>
                  {notificationChannel === "email" ? (
                    <Link href="/backoffice/notifications/global-email-template" className={styles.rowActionButton}>
                      Global email template
                    </Link>
                  ) : null}
                  <Link href="/backoffice/notifications/actions" className={styles.rowActionButton}>
                    Actions & batches
                  </Link>
                </div>
                <div className={styles.tableShell}>
                {notificationError ? <p className={styles.inlineError}>{notificationError}</p> : null}
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Notification</th>
                      <th>When sent</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNotificationRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div className={styles.primaryCell}>
                            <strong>{rule.title}</strong>
                            <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                          </div>
                        </td>
                        <td>{rule.sendTiming}</td>
                        <td>
                          <Link
                            href={`/backoffice/notifications/${encodeURIComponent(rule.id)}?channel=${notificationChannel}`}
                            className={styles.rowActionButton}
                          >
                            View details
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {visibleNotificationRules.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.emptyCell}>
                          No {notificationChannel} notification rules match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                </div>
              </section>
            ) : null}

            {activeView === "activity" ? (
              <section className={styles.tableShell}>
                {activityLoading ? (
                  <p className={styles.inlineNotice}>Loading the latest activity logs.</p>
                ) : null}
                {activityError ? <p className={styles.inlineError}>{activityError}</p> : null}
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Activity</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Table</th>
                      <th>Trip</th>
                      <th>Changed fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivityLogs.map((log) => {
                      const changedKeys = Array.isArray(log.metadata.changed_keys)
                        ? log.metadata.changed_keys.join(", ")
                        : "";

                      return (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.occurredAt)}</td>
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
                          <td>
                            {log.tripId ? (
                              <Link href={`/backoffice/trips/${log.tripId}`} className={styles.rowAction}>
                                View trip
                              </Link>
                            ) : (
                              <span className={styles.subtleText}>No trip</span>
                            )}
                          </td>
                          <td>{changedKeys || "Not set"}</td>
                        </tr>
                      );
                    })}
                    {filteredActivityLogs.length === 0 && !activityLoading ? (
                      <tr>
                        <td colSpan={7} className={styles.emptyCell}>
                          No activity records match this search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ) : null}

            {activeView === "documentation" ? (
              <section className={styles.documentation}>
                <div className={styles.documentationIntro}>
                  <p className={styles.kicker}>Operations guide</p>
                  <h1>How Journi works</h1>
                  <span>
                    A working reference for admins covering account access, trip workflows,
                    public participation, notifications, billing, editing, and audit activity.
                  </span>
                </div>

                {filteredParticipantLifecycle.length > 0 ? (
                  <section className={styles.lifecyclePanel}>
                    <div className={styles.lifecycleHeader}>
                      <div>
                        <p className={styles.kicker}>Trip participants</p>
                        <h2>What happens and when</h2>
                      </div>
                      <span>{filteredParticipantLifecycle.length} stages</span>
                    </div>
                    <div className={styles.lifecycleList}>
                      {filteredParticipantLifecycle.map((item, index) => (
                        <article key={item.label} className={styles.lifecycleItem}>
                          <span className={styles.lifecycleStep}>{index + 1}</span>
                          <div>
                            <strong>{item.label}</strong>
                            <dl>
                              <div>
                                <dt>When</dt>
                                <dd>{item.timing}</dd>
                              </div>
                              <div>
                                <dt>Status</dt>
                                <dd>{item.status}</dd>
                              </div>
                              <div>
                                <dt>Meaning</dt>
                                <dd>{item.meaning}</dd>
                              </div>
                              <div>
                                <dt>Backoffice check</dt>
                                <dd>{item.adminAction}</dd>
                              </div>
                            </dl>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className={styles.documentationGrid}>
                  {filteredDocumentationSections.map((section) => (
                    <article key={section.title} className={styles.documentationCard}>
                      <div>
                        <strong>{section.title}</strong>
                        <p>{section.summary}</p>
                      </div>
                      <ol>
                        {section.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>

                {filteredDocumentationSections.length === 0 && filteredParticipantLifecycle.length === 0 ? (
                  <section className={styles.errorState}>
                    <strong>No documentation found</strong>
                    <p>Try searching for participants, trips, notifications, activity, payments, or access.</p>
                  </section>
                ) : null}
              </section>
            ) : null}

            {activeView === "testing" ? (
              <section className={styles.testing}>
                <div className={styles.documentationIntro}>
                  <p className={styles.kicker}>Testing guide</p>
                  <h1>Release testing checklist</h1>
                  <span>
                    Use this section to work through the app areas that need manual testing and
                    keep a simple local log of what passed, failed, or needs a retest.
                  </span>
                </div>

                <div className={styles.testingColumns}>
                  <section className={styles.testingPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Things to test</strong>
                        <span>{filteredTestingChecklist.length} areas shown</span>
                      </div>
                    </div>
                    <div className={styles.testingChecklist}>
                      {filteredTestingChecklist.map((section) => (
                        <article key={section.area}>
                          <strong>{section.area}</strong>
                          <ul>
                            {section.checks.map((check) => (
                              <li key={check}>
                                <input type="checkbox" aria-label={check} />
                                <span>{check}</span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className={styles.testingPanel}>
                    <div className={styles.dashboardPanelHeader}>
                      <div>
                        <strong>Testing log</strong>
                        <span>{filteredTestingLog.length} entries shown</span>
                      </div>
                    </div>
                    <div className={styles.testLogForm}>
                      <label>
                        <span>Area</span>
                        <select value={testArea} onChange={(event) => setTestArea(event.target.value)}>
                          {testingChecklist.map((section) => (
                            <option key={section.area} value={section.area}>
                              {section.area}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Status</span>
                        <select
                          value={testStatus}
                          onChange={(event) =>
                            setTestStatus(event.target.value as TestingLogEntry["status"])
                          }
                        >
                          <option value="Pass">Pass</option>
                          <option value="Fail">Fail</option>
                          <option value="Blocked">Blocked</option>
                          <option value="Retest">Retest</option>
                        </select>
                      </label>
                      <label>
                        <span>Tester</span>
                        <input
                          value={testTester}
                          onChange={(event) => setTestTester(event.target.value)}
                          placeholder="Name"
                        />
                      </label>
                      <label className={styles.testLogNotes}>
                        <span>Notes</span>
                        <textarea
                          value={testNotes}
                          onChange={(event) => setTestNotes(event.target.value)}
                          placeholder="What was tested, what happened, and any follow-up needed"
                        />
                      </label>
                      <button type="button" className={styles.rowActionButton} onClick={addTestingLogEntry}>
                        Add log entry
                      </button>
                    </div>

                    <div className={styles.testLogList}>
                      {filteredTestingLog.map((entry) => (
                        <article key={entry.id}>
                          <div>
                            <strong>{entry.area}</strong>
                            <span>{formatDateTime(entry.createdAt)} · {entry.tester}</span>
                          </div>
                          <p>{entry.notes}</p>
                          <div className={styles.rowActionGroup}>
                            <span className={getStatusTone(entry.status === "Pass" ? "active" : "draft")}>
                              {entry.status}
                            </span>
                            <button
                              type="button"
                              className={styles.rowAction}
                              onClick={() => removeTestingLogEntry(entry.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                      {filteredTestingLog.length === 0 ? (
                        <section className={styles.errorState}>
                          <strong>No testing log entries yet</strong>
                          <p>Add the first entry when you start testing this release.</p>
                        </section>
                      ) : null}
                    </div>
                  </section>
                </div>
              </section>
            ) : null}

            {selectedNotification ? (
              <div className={styles.sideDrawerBackdrop} role="presentation">
                <aside
                  className={styles.sideDrawer}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="notification-detail-title"
                >
                  <div className={styles.sideDrawerHeader}>
                    <div>
                      <p className={styles.kicker}>Notification details</p>
                      <strong id="notification-detail-title">{selectedNotification.title}</strong>
                      <span>{selectedNotification.triggerKey}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.cellEditorClose}
                      onClick={() => setSelectedNotificationId(null)}
                      aria-label="Close notification details"
                    >
                      ×
                    </button>
                  </div>

                  <div className={styles.notificationDetailForm}>
                    {notificationError ? <p className={styles.inlineError}>{notificationError}</p> : null}
                    <label className={styles.notificationEnabledField}>
                      <span>
                        <strong>Enabled</strong>
                        <small>Allow this notification to be sent</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedNotification.enabled}
                        onChange={(event) => updateNotificationRule(selectedNotification.id, { enabled: event.target.checked })}
                      />
                    </label>
                    <label>
                      <span>When sent</span>
                      <textarea
                        value={selectedNotification.sendTiming}
                        onChange={(event) => updateNotificationRule(selectedNotification.id, { sendTiming: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Audience</span>
                      <input
                        value={selectedNotification.audience}
                        onChange={(event) => updateNotificationRule(selectedNotification.id, { audience: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Destination</span>
                      <select
                        value={selectedNotification.channel}
                        onChange={(event) => updateNotificationRule(selectedNotification.id, { channel: event.target.value })}
                      >
                        <option value="Email">Email</option>
                        <option value="In-app">Push</option>
                        <option value="Email + In-app">Email + Push</option>
                      </select>
                    </label>
                    <label>
                      <span>Subject</span>
                      <textarea
                        value={selectedNotification.subject}
                        onChange={(event) => updateNotificationRule(selectedNotification.id, { subject: event.target.value })}
                      />
                    </label>
                    {selectedNotification.channel.toLowerCase().includes("email") ? (
                      <section className={styles.emailTemplateEditor}>
                        <div className={styles.emailTemplateHeader}>
                          <div>
                            <strong>Email template</strong>
                            <span>The HTML body delivered to the recipient</span>
                          </div>
                          <div className={styles.emailTemplateActions}>
                            <button
                              type="button"
                              className={emailTemplateView === "edit" ? styles.templateTabActive : styles.templateTab}
                              onClick={() => setEmailTemplateView("edit")}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={emailTemplateView === "preview" ? styles.templateTabActive : styles.templateTab}
                              onClick={() => setEmailTemplateView("preview")}
                            >
                              Preview
                            </button>
                          </div>
                        </div>
                        {emailTemplateView === "edit" ? (
                          <>
                            <div className={styles.emailTemplateTools}>
                              <span>Available: {"{first_name}"}, {"{participant_name}"}, {"{trip_title}"}, {"{action_url}"}</span>
                              <button
                                type="button"
                                className={styles.rowAction}
                                onClick={() => updateNotificationRule(selectedNotification.id, {
                                  body: createEmailTemplate(selectedNotification.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()),
                                })}
                              >
                                Create branded template
                              </button>
                            </div>
                            <textarea
                              className={styles.emailTemplateCode}
                              value={selectedNotification.body}
                              spellCheck={false}
                              onChange={(event) => updateNotificationRule(selectedNotification.id, { body: event.target.value })}
                            />
                          </>
                        ) : (
                          <iframe
                            className={styles.emailTemplatePreview}
                            title="Email template preview"
                            sandbox=""
                            srcDoc={previewEmailTemplate(selectedNotification.body)}
                          />
                        )}
                      </section>
                    ) : (
                      <label>
                        <span>Message</span>
                        <textarea
                          className={styles.notificationMessageField}
                          value={selectedNotification.body}
                          onChange={(event) => updateNotificationRule(selectedNotification.id, { body: event.target.value })}
                        />
                      </label>
                    )}
                    <div className={styles.notificationDetailMeta}>
                      <span>Source</span>
                      <strong>{normaliseLabel(selectedNotification.source)}</strong>
                    </div>
                    <div className={styles.notificationDetailActions}>
                      <button type="button" className={styles.rowAction} onClick={() => setSelectedNotificationId(null)}>
                        Close
                      </button>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        disabled={savingNotificationId === selectedNotification.id}
                        onClick={() => void saveNotification(selectedNotification.id)}
                      >
                        {savingNotificationId === selectedNotification.id ? "Saving" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}

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
                  {cellEditor.options ? (
                    <select
                      value={cellEditorValue}
                      onChange={(event) => setCellEditorValue(event.target.value)}
                      autoFocus
                    >
                      {cellEditor.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={cellEditor.inputType ?? "text"}
                      value={cellEditorValue}
                      onChange={(event) => setCellEditorValue(event.target.value)}
                      autoFocus
                    />
                  )}
                  <div className={styles.cellEditorActions}>
                    <button type="button" className={styles.rowAction} onClick={() => setCellEditor(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.rowActionButton}
                      disabled={savingRecordId !== null}
                      onClick={() => void saveCellEditor()}
                    >
                      {savingRecordId ? "Saving" : "Save"}
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {recordActivityDrawer ? (
              <div className={styles.sideDrawerBackdrop} role="presentation">
                <aside
                  className={styles.sideDrawer}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="record-activity-title"
                >
                  <div className={styles.sideDrawerHeader}>
                    <div>
                      <p className={styles.kicker}>Record activity</p>
                      <strong id="record-activity-title">
                        {recordActivityDrawer.record.label || "Untitled record"}
                      </strong>
                      <span>
                        {normaliseLabel(recordActivityDrawer.record.table)} ·{" "}
                        {recordActivityDrawer.record.tripTitle}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.cellEditorClose}
                      onClick={() => setRecordActivityDrawer(null)}
                      aria-label="Close activity drawer"
                    >
                      ×
                    </button>
                  </div>

                  {recordActivityDrawer.loading ? (
                    <section className={styles.loadingState}>
                      <span className={styles.spinner} />
                      <div>
                        <strong>Loading activity</strong>
                        <p>Checking the audit trail for this record.</p>
                      </div>
                    </section>
                  ) : null}

                  {recordActivityDrawer.error ? (
                    <section className={styles.errorState}>
                      <strong>Activity unavailable</strong>
                      <p>{recordActivityDrawer.error}</p>
                    </section>
                  ) : null}

                  {!recordActivityDrawer.loading && !recordActivityDrawer.error ? (
                    <div className={styles.activityTimeline}>
                      {recordActivityDrawer.logs.map((log) => {
                        const changedKeys = Array.isArray(log.metadata.changed_keys)
                          ? log.metadata.changed_keys.join(", ")
                          : "";

                        return (
                          <article key={log.id}>
                            <time>{formatDateTime(log.occurredAt)}</time>
                            <strong>{log.summary}</strong>
                            <span>{log.actorEmail || "System"}</span>
                            <p>
                              {log.action}
                              {changedKeys ? ` · Changed ${changedKeys}` : ""}
                            </p>
                          </article>
                        );
                      })}
                      {recordActivityDrawer.logs.length === 0 ? (
                        <section className={styles.errorState}>
                          <strong>No activity yet</strong>
                          <p>This record does not have any audit events yet.</p>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </aside>
              </div>
            ) : null}

          </>
        ) : null}
      </section>
    </main>
  );
}
