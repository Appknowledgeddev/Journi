import { NextRequest, NextResponse } from "next/server";
import {
  summariseTripWorkspace,
  type TripDetail,
  type TripParticipant,
} from "@/app/trips/[id]/trip-workspace-shared";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripRow = TripDetail & {
  owner_id: string | null;
};

function schemaError(message: string) {
  if (
    message.toLowerCase().includes("column") ||
    message.toLowerCase().includes("schema") ||
    message.toLowerCase().includes("relation")
  ) {
    return `${message}. The live Supabase schema may be out of date for trips, trip_participants, or planning tables.`;
  }

  return message;
}

function isMissingPaymentsTable(message: string) {
  return message.includes("Could not find the table 'public.payments'") ||
    message.includes('relation "public.payments" does not exist');
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const { data: trips, error: tripsError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at, owner_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (tripsError) {
    return NextResponse.json({ error: schemaError(tripsError.message) }, { status: 400 });
  }

  const tripRows = (trips ?? []) as TripRow[];
  const tripIds = tripRows.map((trip) => trip.id);

  if (tripIds.length === 0) {
    return NextResponse.json({
      totals: {
        trips: 0,
        outstandingResponses: 0,
        readyToDecide: 0,
        confirmedParticipants: 0,
      },
      trips: [],
    });
  }

  const [
    { data: participantRows, error: participantsError },
    { data: hotelRows, error: hotelsError },
    { data: activityRows, error: activitiesError },
    { data: transportRows, error: transportError },
    { data: diningRows, error: diningError },
  ] = await Promise.all([
    supabaseAdmin
      .from("trip_participants")
      .select("id, trip_id, email, full_name, role, status, invited_at, responded_at, created_at")
      .in("trip_id", tripIds),
    supabaseAdmin.from("hotels").select("trip_id").in("trip_id", tripIds),
    supabaseAdmin.from("activities").select("trip_id").in("trip_id", tripIds),
    supabaseAdmin.from("transport").select("trip_id").in("trip_id", tripIds),
    supabaseAdmin.from("dining").select("trip_id").in("trip_id", tripIds),
  ]);

  const planningError = participantsError || hotelsError || activitiesError || transportError || diningError;

  if (planningError) {
    return NextResponse.json({ error: schemaError(planningError.message) }, { status: 400 });
  }

  const paymentsResult = await supabaseAdmin
    .from("payments")
    .select("trip_id, status")
    .in("trip_id", tripIds);

  let paymentRows: Array<{ trip_id: string | null; status: string | null }> = [];

  if (paymentsResult.error) {
    if (!isMissingPaymentsTable(paymentsResult.error.message)) {
      return NextResponse.json({ error: schemaError(paymentsResult.error.message) }, { status: 400 });
    }
  } else {
    paymentRows = (paymentsResult.data ?? []) as Array<{ trip_id: string | null; status: string | null }>;
  }

  const participantsByTrip = new Map<string, TripParticipant[]>();
  for (const participant of (participantRows ?? []) as Array<TripParticipant & { trip_id: string }>) {
    const current = participantsByTrip.get(participant.trip_id) ?? [];
    current.push(participant);
    participantsByTrip.set(participant.trip_id, current);
  }

  function countByTrip(rows: Array<{ trip_id: string | null }>) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.trip_id) {
        continue;
      }

      counts.set(row.trip_id, (counts.get(row.trip_id) ?? 0) + 1);
    }
    return counts;
  }

  const hotelsByTrip = countByTrip((hotelRows ?? []) as Array<{ trip_id: string | null }>);
  const activitiesByTrip = countByTrip((activityRows ?? []) as Array<{ trip_id: string | null }>);
  const transportByTrip = countByTrip((transportRows ?? []) as Array<{ trip_id: string | null }>);
  const diningByTrip = countByTrip((diningRows ?? []) as Array<{ trip_id: string | null }>);

  const paymentsByTrip = new Map<
    string,
    { total: number; due: number; pending: number; paid: number; overdue: number }
  >();

  for (const payment of paymentRows) {
    if (!payment.trip_id) {
      continue;
    }

    const current = paymentsByTrip.get(payment.trip_id) ?? {
      total: 0,
      due: 0,
      pending: 0,
      paid: 0,
      overdue: 0,
    };

    current.total += 1;

    if (payment.status === "due") {
      current.due += 1;
    } else if (payment.status === "pending") {
      current.pending += 1;
    } else if (payment.status === "paid") {
      current.paid += 1;
    } else if (payment.status === "overdue") {
      current.overdue += 1;
    }

    paymentsByTrip.set(payment.trip_id, current);
  }

  const tripSummaries = tripRows.map((trip) => {
    const participants = participantsByTrip.get(trip.id) ?? [];
    const planningCounts = {
      hotels: hotelsByTrip.get(trip.id) ?? 0,
      activities: activitiesByTrip.get(trip.id) ?? 0,
      transport: transportByTrip.get(trip.id) ?? 0,
      dining: diningByTrip.get(trip.id) ?? 0,
    };
    const planningProgress = Math.round(
      ([planningCounts.hotels, planningCounts.activities, planningCounts.transport, planningCounts.dining].filter(
        (count) => count > 0,
      ).length /
        4) *
        100,
    );
    const summary = summariseTripWorkspace({
      trip,
      participants,
      planningCounts,
      planningProgress,
      paymentSummary: paymentsByTrip.get(trip.id),
    });

    return {
      trip,
      summary,
      planningCounts,
    };
  });

  const totals = tripSummaries.reduce(
    (accumulator, item) => {
      accumulator.trips += 1;
      accumulator.outstandingResponses += item.summary.participantSummary.outstanding;
      accumulator.confirmedParticipants += item.summary.participantSummary.confirmed;
      if (item.summary.phase === "ready_to_decide") {
        accumulator.readyToDecide += 1;
      }
      return accumulator;
    },
    {
      trips: 0,
      outstandingResponses: 0,
      readyToDecide: 0,
      confirmedParticipants: 0,
    },
  );

  return NextResponse.json({
    totals,
    trips: tripSummaries,
  });
}
