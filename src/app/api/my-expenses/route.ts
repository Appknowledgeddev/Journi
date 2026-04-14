import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  title: string;
  destination: string | null;
  status: string;
  owner_id?: string | null;
};

type PaymentRow = {
  id: string;
  trip_id: string | null;
  user_id: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type SelectionExpenseRow = {
  id: string;
  trip_id: string;
  category: "hotel" | "activity" | "transport" | "dining";
  title: string;
  location: string | null;
  amount: number | null;
  currency: string | null;
  notes: string | null;
};

function isMissingPaymentsTable(message: string) {
  return message.includes("Could not find the table 'public.payments'") ||
    message.includes('relation "public.payments" does not exist');
}

function schemaError(message: string) {
  if (message.toLowerCase().includes("column")) {
    return `${message}. The live Supabase schema may be missing fields on public.payments, public.trip_participants, or the planning tables.`;
  }

  return message;
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

  const userEmail = (user.email ?? "").toLowerCase();

  const { data: ownedTrips, error: ownedTripsError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, status, owner_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (ownedTripsError) {
    return NextResponse.json({ error: schemaError(ownedTripsError.message) }, { status: 400 });
  }

  const { data: participantRows, error: participantError } = await supabaseAdmin
    .from("trip_participants")
    .select("trip_id")
    .or(`user_id.eq.${user.id},email.eq.${userEmail}`);

  if (participantError) {
    return NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 });
  }

  const accessibleTripIds = Array.from(
    new Set([
      ...((ownedTrips ?? []) as TripRow[]).map((trip) => trip.id),
      ...((participantRows ?? []) as Array<{ trip_id: string | null }>)
        .map((row) => row.trip_id)
        .filter((tripId): tripId is string => Boolean(tripId)),
    ]),
  );

  let sharedTrips: TripRow[] = (ownedTrips ?? []) as TripRow[];

  if (accessibleTripIds.length > 0) {
    const { data: tripRows, error: sharedTripsError } = await supabaseAdmin
      .from("trips")
      .select("id, title, destination, status, owner_id")
      .in("id", accessibleTripIds);

    if (sharedTripsError) {
      return NextResponse.json({ error: schemaError(sharedTripsError.message) }, { status: 400 });
    }

    sharedTrips = (tripRows ?? []) as TripRow[];
  }

  const paymentFilters = [`user_id.eq.${user.id}`];

  if (accessibleTripIds.length > 0) {
    paymentFilters.push(`trip_id.in.(${accessibleTripIds.join(",")})`);
  }

  const { data: paymentRows, error: paymentsError } = await supabaseAdmin
    .from("payments")
    .select("id, trip_id, user_id, status, amount, currency, paid_at, created_at, metadata")
    .or(paymentFilters.join(","))
    .order("created_at", { ascending: false });

  let paymentsWarning: string | null = null;
  let safePaymentRows: PaymentRow[] = (paymentRows ?? []) as PaymentRow[];

  if (paymentsError) {
    if (isMissingPaymentsTable(paymentsError.message)) {
      paymentsWarning =
        "The payments table is not in Supabase yet, so payment rows are hidden for now.";
      safePaymentRows = [];
    } else {
      return NextResponse.json({ error: schemaError(paymentsError.message) }, { status: 400 });
    }
  }

  let hotels: SelectionExpenseRow[] = [];
  let activities: SelectionExpenseRow[] = [];
  let transport: SelectionExpenseRow[] = [];
  let dining: SelectionExpenseRow[] = [];

  if (accessibleTripIds.length > 0) {
    const [
      { data: hotelRows, error: hotelError },
      { data: activityRows, error: activityError },
      { data: transportRows, error: transportError },
      { data: diningRows, error: diningError },
    ] = await Promise.all([
      supabaseAdmin
        .from("hotels")
        .select("id, trip_id, name, location, price_per_night, currency, notes")
        .in("trip_id", accessibleTripIds),
      supabaseAdmin
        .from("activities")
        .select("id, trip_id, title, location, price, currency, notes")
        .in("trip_id", accessibleTripIds),
      supabaseAdmin
        .from("transport")
        .select("id, trip_id, mode, departure_location, arrival_location, price, currency, notes")
        .in("trip_id", accessibleTripIds),
      supabaseAdmin
        .from("dining")
        .select("id, trip_id, name, location, notes")
        .in("trip_id", accessibleTripIds),
    ]);

    const firstPlanningError = hotelError || activityError || transportError || diningError;

    if (firstPlanningError) {
      return NextResponse.json({ error: schemaError(firstPlanningError.message) }, { status: 400 });
    }

    hotels = ((hotelRows ?? []) as Array<{
      id: string;
      trip_id: string;
      name: string;
      location: string | null;
      price_per_night: number | null;
      currency: string | null;
      notes: string | null;
    }>).map((row) => ({
      id: row.id,
      trip_id: row.trip_id,
      category: "hotel",
      title: row.name,
      location: row.location,
      amount: row.price_per_night,
      currency: row.currency,
      notes: row.notes,
    }));

    activities = ((activityRows ?? []) as Array<{
      id: string;
      trip_id: string;
      title: string;
      location: string | null;
      price: number | null;
      currency: string | null;
      notes: string | null;
    }>).map((row) => ({
      id: row.id,
      trip_id: row.trip_id,
      category: "activity",
      title: row.title,
      location: row.location,
      amount: row.price,
      currency: row.currency,
      notes: row.notes,
    }));

    transport = ((transportRows ?? []) as Array<{
      id: string;
      trip_id: string;
      mode: string;
      departure_location: string | null;
      arrival_location: string | null;
      price: number | null;
      currency: string | null;
      notes: string | null;
    }>).map((row) => ({
      id: row.id,
      trip_id: row.trip_id,
      category: "transport",
      title: row.mode,
      location:
        [row.departure_location, row.arrival_location].filter(Boolean).join(" to ") || null,
      amount: row.price,
      currency: row.currency,
      notes: row.notes,
    }));

    dining = ((diningRows ?? []) as Array<{
      id: string;
      trip_id: string;
      name: string;
      location: string | null;
      notes: string | null;
    }>).map((row) => ({
      id: row.id,
      trip_id: row.trip_id,
      category: "dining",
      title: row.name,
      location: row.location,
      amount: null,
      currency: "GBP",
      notes: row.notes,
    }));
  }

  return NextResponse.json({
    trips: sharedTrips,
    payments: safePaymentRows,
    selectionExpenses: [...hotels, ...activities, ...transport, ...dining],
    warning: paymentsWarning,
  });
}
