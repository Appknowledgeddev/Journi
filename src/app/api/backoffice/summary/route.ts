import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import {
  getBackofficeUserRole,
  requireBackofficeAccess,
} from "@/lib/backoffice/auth";
import { loadNotificationRules } from "@/lib/backoffice/notifications";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string | null;
  visibility?: "private" | "public" | null;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  created_at: string | null;
  owner_id: string | null;
};

type ParticipantRow = {
  id?: string;
  trip_id: string | null;
  user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  status: string | null;
  membership_status?: string | null;
  attendance_status?: string | null;
  created_at?: string | null;
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

type CommentRow = {
  id: string;
  trip_id: string | null;
  author_id: string | null;
  body: string | null;
  created_at: string | null;
  updated_at?: string | null;
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

const operationalTables = [
  "participants",
  "hotels",
  "activities",
  "transport",
  "dining",
  "payments",
  "comments",
  "polls",
  "options",
] as const;

const perTripObjectTables = [
  "hotels",
  "activities",
  "transport",
  "dining",
  "payments",
  "comments",
  "polls",
  "options",
] as const;

function normaliseMembershipStatus(participant: ParticipantRow) {
  if (participant.membership_status) {
    return participant.membership_status;
  }

  if (participant.status === "accepted") {
    return "active";
  }

  if (participant.status === "pending") {
    return "pending_approval";
  }

  return participant.status ?? "invited";
}

async function loadTrips() {
  const preferredSelect =
    "id,title,destination,description,status,visibility,starts_at,ends_at,cover_image_url,created_at,owner_id";
  const fallbackSelect =
    "id,title,destination,description,status,starts_at,ends_at,cover_image_url,created_at,owner_id";

  const preferredResult = await supabaseAdmin
    .from("trips")
    .select(preferredSelect)
    .order("created_at", { ascending: false })
    .limit(500);
  let data: unknown = preferredResult.data;
  let error = preferredResult.error;

  if (error) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(fallbackSelect)
      .order("created_at", { ascending: false })
      .limit(500);

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as TripRow[];
}

async function loadParticipants() {
  const selects = [
    "id,trip_id,user_id,email,full_name,role,status,membership_status,attendance_status,created_at",
    "id,trip_id,user_id,email,full_name,status,membership_status,attendance_status,created_at",
    "id,trip_id,user_id,email,full_name,status,created_at",
    "id,trip_id,email,full_name,status,created_at",
  ];

  for (const select of selects) {
    const { data, error } = await supabaseAdmin
      .from("trip_participants")
      .select(select)
      .limit(5000);

    if (!error) {
      return (data ?? []) as unknown as ParticipantRow[];
    }
  }

  return [];
}

async function safeCount(table: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    return 0;
  }

  return count ?? 0;
}

function incrementObjectCount(
  countsByTrip: Map<string, Record<string, number>>,
  tripId: string | null | undefined,
  key: string,
  amount = 1,
) {
  if (!tripId) {
    return;
  }

  const counts = countsByTrip.get(tripId) ?? {};
  counts[key] = (counts[key] ?? 0) + amount;
  countsByTrip.set(tripId, counts);
}

async function loadPerTripObjectCounts(participants: ParticipantRow[]) {
  const countsByTrip = new Map<string, Record<string, number>>();

  for (const participant of participants) {
    incrementObjectCount(countsByTrip, participant.trip_id, "participants");
  }

  const tableRows = await Promise.all(
    perTripObjectTables.map(async (table) => {
      const { data, error } = await supabaseAdmin.from(table).select("trip_id").limit(5000);

      if (error || !data) {
        return [table, []] as const;
      }

      return [table, data as Array<{ trip_id?: string | null }>] as const;
    }),
  );

  for (const [table, rows] of tableRows) {
    for (const row of rows) {
      incrementObjectCount(countsByTrip, row.trip_id, table);
    }
  }

  return countsByTrip;
}

function recordTripTitle(tripTitleById: Map<string, string>, tripId: unknown) {
  if (typeof tripId !== "string") {
    return "No trip";
  }

  return tripTitleById.get(tripId) ?? "Unknown trip";
}

function toRecord(
  table: string,
  row: Record<string, unknown>,
  tripTitleById: Map<string, string>,
): OperationalRecord {
  const tripId = typeof row.trip_id === "string" ? row.trip_id : null;
  const label =
    typeof row.name === "string"
      ? row.name
      : typeof row.title === "string"
        ? row.title
        : typeof row.body === "string"
          ? row.body.slice(0, 70)
          : typeof row.email === "string"
            ? row.email
            : typeof row.provider === "string"
              ? row.provider
              : String(row.id ?? "Untitled");
  const detail =
    typeof row.location === "string"
      ? row.location
      : typeof row.category === "string"
        ? row.category
        : typeof row.mode === "string"
          ? row.mode
          : typeof row.status === "string"
            ? row.status
            : typeof row.entity_type === "string"
              ? row.entity_type
              : "";

  return {
    id: String(row.id ?? ""),
    table,
    label,
    tripId,
    tripTitle: recordTripTitle(tripTitleById, tripId),
    detail,
    status: typeof row.status === "string" ? row.status : "record",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

async function loadOperationalRecords(tripTitleById: Map<string, string>) {
  const queries = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id,trip_id,name,location,price_per_night,currency,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("activities")
      .select("id,trip_id,title,location,price,currency,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("transport")
      .select("id,trip_id,mode,provider,departure_location,arrival_location,price,currency,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("dining")
      .select("id,trip_id,name,location,cuisine,price_level,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("payments")
      .select("id,trip_id,user_id,status,amount,currency,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("comments")
      .select("id,trip_id,author_id,entity_type,body,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("polls")
      .select("id,trip_id,title,description,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("options")
      .select("id,trip_id,category,title,description,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const tableNames = ["hotels", "activities", "transport", "dining", "payments", "comments", "polls", "options"];

  return queries.flatMap((query, index) => {
    if (query.error || !query.data) {
      return [];
    }

    return (query.data as Record<string, unknown>[]).map((row) =>
      toRecord(tableNames[index], row, tripTitleById),
    );
  });
}

async function loadPaymentRows() {
  const selects = [
    "id,trip_id,user_id,status,amount,currency,stripe_customer_id,stripe_subscription_id,paid_at,created_at",
    "id,trip_id,user_id,status,amount,currency,paid_at,created_at",
  ];

  for (const select of selects) {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!error) {
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    }
  }

  return [];
}

async function loadTripComments() {
  const { data, error } = await supabaseAdmin
    .from("comments")
    .select("id,trip_id,author_id,body,created_at,updated_at")
    .eq("entity_type", "trip")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return [];
  }

  return (data ?? []) as unknown as CommentRow[];
}

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const [usersResult, trips, participants, notificationRules] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      loadTrips(),
      loadParticipants(),
      loadNotificationRules(),
    ]);

    if (usersResult.error) {
      throw usersResult.error;
    }

    const users = usersResult.data.users.map((backofficeUser) => ({
      id: backofficeUser.id,
      email: backofficeUser.email ?? "",
      fullName:
        typeof backofficeUser.user_metadata?.full_name === "string"
          ? backofficeUser.user_metadata.full_name
          : "",
      role: getBackofficeUserRole(backofficeUser) || "member",
      plan:
        typeof backofficeUser.user_metadata?.plan === "string"
          ? backofficeUser.user_metadata.plan
          : "free",
      subscriptionStatus:
        typeof backofficeUser.user_metadata?.subscription_status === "string"
          ? backofficeUser.user_metadata.subscription_status
          : typeof backofficeUser.user_metadata?.stripe_subscription_status === "string"
            ? backofficeUser.user_metadata.stripe_subscription_status
            : null,
      stripeCustomerId:
        typeof backofficeUser.user_metadata?.stripe_customer_id === "string"
          ? backofficeUser.user_metadata.stripe_customer_id
          : null,
      stripeSubscriptionId:
        typeof backofficeUser.user_metadata?.stripe_subscription_id === "string"
          ? backofficeUser.user_metadata.stripe_subscription_id
          : null,
      createdAt: backofficeUser.created_at,
      lastSignInAt: backofficeUser.last_sign_in_at ?? null,
    }));

    const userEmailById = new Map(users.map((backofficeUser) => [backofficeUser.id, backofficeUser.email]));
    const userNameById = new Map(
      users.map((backofficeUser) => [
        backofficeUser.id,
        backofficeUser.fullName || backofficeUser.email || "Journi traveller",
      ]),
    );
    const tripTitleById = new Map(trips.map((trip) => [trip.id, trip.title]));
    const participantsByTrip = new Map<string, ParticipantRow[]>();
    const objectCountsByTrip = await loadPerTripObjectCounts(participants);
    const participantSummaryByTrip = new Map<
      string,
      {
        total: number;
        active: number;
        pendingApproval: number;
        invited: number;
        declined: number;
        going: number;
        maybe: number;
        notGoing: number;
      }
    >();

    for (const participant of participants) {
      if (!participant.trip_id) {
        continue;
      }

      participantsByTrip.set(participant.trip_id, [
        ...(participantsByTrip.get(participant.trip_id) ?? []),
        participant,
      ]);

      const summary =
        participantSummaryByTrip.get(participant.trip_id) ??
        {
          total: 0,
          active: 0,
          pendingApproval: 0,
          invited: 0,
          declined: 0,
          going: 0,
          maybe: 0,
          notGoing: 0,
        };
      const membershipStatus = normaliseMembershipStatus(participant);

      summary.total += 1;

      if (membershipStatus === "active" || membershipStatus === "accepted") {
        summary.active += 1;
      } else if (membershipStatus === "pending_approval" || membershipStatus === "pending") {
        summary.pendingApproval += 1;
      } else if (membershipStatus === "declined") {
        summary.declined += 1;
      } else {
        summary.invited += 1;
      }

      if (participant.attendance_status === "going") {
        summary.going += 1;
      } else if (participant.attendance_status === "maybe") {
        summary.maybe += 1;
      } else if (participant.attendance_status === "not_going") {
        summary.notGoing += 1;
      }

      participantSummaryByTrip.set(participant.trip_id, summary);
    }

    const backofficeTrips = trips.map((trip) => {
      const objectConnections = objectCountsByTrip.get(trip.id) ?? {};

      return {
        ...trip,
        visibility: trip.visibility ?? "private",
        ownerEmail: trip.owner_id ? userEmailById.get(trip.owner_id) ?? "Unknown owner" : "Unknown owner",
        objectConnections: {
          participants: objectConnections.participants ?? 0,
          hotels: objectConnections.hotels ?? 0,
          activities: objectConnections.activities ?? 0,
          transport: objectConnections.transport ?? 0,
          dining: objectConnections.dining ?? 0,
          payments: objectConnections.payments ?? 0,
          comments: objectConnections.comments ?? 0,
          polls: objectConnections.polls ?? 0,
          options: objectConnections.options ?? 0,
        },
        participantSummary:
          participantSummaryByTrip.get(trip.id) ??
          {
            total: 0,
            active: 0,
            pendingApproval: 0,
            invited: 0,
            declined: 0,
            going: 0,
            maybe: 0,
            notGoing: 0,
          },
      };
    });

    const objectCounts = Object.fromEntries(
      await Promise.all(
        operationalTables.map(async (table) => [
          table,
          table === "participants" ? participants.length : await safeCount(table),
        ]),
      ),
    ) as Record<string, number>;
    const [operationalRecords, paymentRows, tripComments] = await Promise.all([
      loadOperationalRecords(tripTitleById),
      loadPaymentRows(),
      loadTripComments(),
    ]);
    const participantRecords = participants.map((participant) =>
      toRecord("participants", participant as unknown as Record<string, unknown>, tripTitleById),
    );
    const payments: PaymentRecord[] = paymentRows.map((payment) => {
      const tripId = typeof payment.trip_id === "string" ? payment.trip_id : null;
      const userId = typeof payment.user_id === "string" ? payment.user_id : null;

      return {
        id: String(payment.id ?? ""),
        tripId,
        tripTitle: recordTripTitle(tripTitleById, tripId),
        userId,
        userEmail: userId ? userEmailById.get(userId) ?? "Unknown user" : "No user",
        status: typeof payment.status === "string" ? payment.status : null,
        amount: typeof payment.amount === "number" ? payment.amount : null,
        currency: typeof payment.currency === "string" ? payment.currency : null,
        stripeCustomerId:
          typeof payment.stripe_customer_id === "string" ? payment.stripe_customer_id : null,
        stripeSubscriptionId:
          typeof payment.stripe_subscription_id === "string" ? payment.stripe_subscription_id : null,
        paidAt: typeof payment.paid_at === "string" ? payment.paid_at : null,
        createdAt: typeof payment.created_at === "string" ? payment.created_at : null,
      };
    });
    const subscriptionById = new Map<string, SubscriptionRecord>();

    for (const user of users) {
      if (!user.stripeSubscriptionId && user.plan === "free" && !user.subscriptionStatus) {
        continue;
      }

      const id = user.stripeSubscriptionId || user.id;
      subscriptionById.set(id, {
        id,
        userId: user.id,
        userEmail: user.email,
        fullName: user.fullName,
        plan: user.plan,
        status: user.subscriptionStatus ?? (user.plan === "free" ? "free" : "unknown"),
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        lastSignInAt: user.lastSignInAt,
        createdAt: user.createdAt,
      });
    }

    for (const payment of payments) {
      if (!payment.stripeSubscriptionId || subscriptionById.has(payment.stripeSubscriptionId)) {
        continue;
      }

      subscriptionById.set(payment.stripeSubscriptionId, {
        id: payment.stripeSubscriptionId,
        userId: payment.userId ?? "",
        userEmail: payment.userEmail,
        fullName: "",
        plan: "Unknown",
        status: payment.status ?? "unknown",
        stripeCustomerId: payment.stripeCustomerId ?? null,
        stripeSubscriptionId: payment.stripeSubscriptionId,
        lastSignInAt: null,
        createdAt: payment.createdAt,
      });
    }
    const subscriptions = Array.from(subscriptionById.values());
    const commentsByTrip = tripComments.reduce<Map<string, CommentRow[]>>((groups, comment) => {
      if (!comment.trip_id) {
        return groups;
      }

      groups.set(comment.trip_id, [...(groups.get(comment.trip_id) ?? []), comment]);
      return groups;
    }, new Map());
    const chatChannels: ChatChannel[] = backofficeTrips.map((trip) => {
      const comments = [...(commentsByTrip.get(trip.id) ?? [])].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
      const latestComment = comments[0] ?? null;
      const channelParticipants = new Map<string, string>();

      for (const participant of participantsByTrip.get(trip.id) ?? []) {
        const label =
          participant.full_name ||
          participant.email ||
          (participant.user_id ? userNameById.get(participant.user_id) : null) ||
          "Unnamed traveller";
        channelParticipants.set(
          participant.user_id || participant.email || label,
          label,
        );
      }

      for (const comment of comments) {
        if (!comment.author_id) {
          continue;
        }

        channelParticipants.set(
          comment.author_id,
          userNameById.get(comment.author_id) ?? userEmailById.get(comment.author_id) ?? "Journi traveller",
        );
      }

      return {
        id: `trip:${trip.id}`,
        tripId: trip.id,
        tripTitle: trip.title,
        destination: trip.destination,
        ownerEmail: trip.ownerEmail,
        visibility: trip.visibility,
        status: trip.status,
        participantCount: channelParticipants.size,
        participantNames: Array.from(channelParticipants.values()).slice(0, 8),
        messageCount: comments.length,
        latestMessage: latestComment?.body ?? null,
        latestMessageAt: latestComment?.created_at ?? null,
        latestAuthorId: latestComment?.author_id ?? null,
        latestAuthorName: latestComment?.author_id
          ? userNameById.get(latestComment.author_id) ?? userEmailById.get(latestComment.author_id) ?? "Journi traveller"
          : "No messages yet",
        latestAuthorEmail: latestComment?.author_id
          ? userEmailById.get(latestComment.author_id) ?? null
          : null,
      };
    });

    const stats = {
      users: users.length,
      trips: backofficeTrips.length,
      publicTrips: backofficeTrips.filter((trip) => trip.visibility === "public").length,
      pendingApprovals: backofficeTrips.reduce(
        (total, trip) => total + trip.participantSummary.pendingApproval,
        0,
      ),
      draftTrips: backofficeTrips.filter((trip) => trip.status === "draft").length,
      activeParticipants: backofficeTrips.reduce(
        (total, trip) => total + trip.participantSummary.active,
        0,
      ),
      records: Object.values(objectCounts).reduce((total, value) => total + Number(value), 0),
      payments: payments.length,
      subscriptions: subscriptions.length,
      chatChannels: chatChannels.length,
      notificationRules: notificationRules.length,
      activityLogs: await safeCount("activity_logs"),
    };

    return NextResponse.json({
      accessMode: access.accessMode,
      stats,
      objectCounts,
      operationalRecords: [...participantRecords, ...operationalRecords],
      payments,
      subscriptions,
      chatChannels,
      notificationRules,
      users,
      trips: backofficeTrips,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load backoffice.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "load the backoffice") },
      { status: 500 },
    );
  }
}
