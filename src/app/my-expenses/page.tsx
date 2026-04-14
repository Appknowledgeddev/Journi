"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";

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

type ExpensesApiResponse = {
  trips?: TripRow[];
  payments?: PaymentRow[];
  selectionExpenses?: Array<{
    id: string;
    trip_id: string;
    category: "hotel" | "activity" | "transport" | "dining";
    title: string;
    location: string | null;
    amount: number | null;
    currency: string | null;
    notes: string | null;
  }>;
  warning?: string;
  error?: string;
};

type ExpenseItem = {
  id: string;
  tripId: string | null;
  tripTitle: string;
  roleView: "organiser" | "participant";
  label: string;
  kind: string;
  status: string;
  amount: number | null;
  currency: string | null;
  date: string | null;
  meta: string | null;
};

type ExpenseRoleView = ExpenseItem["roleView"];

function formatKind(kind: string) {
  switch (kind) {
    case "hotel":
      return "Hotel";
    case "activity":
      return "Activity";
    case "transport":
      return "Transport";
    case "dining":
      return "Dining";
    case "payment":
      return "Payment";
    default:
      return kind;
  }
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || Number.isNaN(amount)) {
    return "Amount to be confirmed";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Awaiting payment date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Awaiting payment date";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function ExpenseRow({ expense }: { expense: ExpenseItem }) {
  const content = (
    <>
      <div className={styles.rowTop}>
        <span className={styles.rowTitle}>{expense.label}</span>
        <span
          className={
            expense.status === "paid"
              ? styles.badgeSuccess
              : expense.status === "pending"
                ? styles.badge
                : styles.badgeSoft
          }
        >
          {expense.status}
        </span>
      </div>
      <div className={styles.tripMetaRow}>
        <span>{expense.tripTitle}</span>
        <span>{formatKind(expense.kind)}</span>
        <span>{formatMoney(expense.amount, expense.currency)}</span>
        <span>{expense.meta || "Trip selection"}</span>
      </div>
      {expense.tripId ? <span className={styles.listRowLinkHint}>Open trip</span> : null}
    </>
  );

  if (!expense.tripId) {
    return <div className={styles.listRow}>{content}</div>;
  }

  return (
    <Link href={`/trips/${expense.tripId}`} className={styles.listRowLink}>
      <div className={styles.listRow}>{content}</div>
    </Link>
  );
}

function MyExpensesManager({
  userId,
  loading,
}: {
  userId: string | null;
  loading: boolean;
}) {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectionExpenses, setSelectionExpenses] = useState<ExpensesApiResponse["selectionExpenses"]>(
    [],
  );
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [expensesWarning, setExpensesWarning] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadExpenses() {
      if (loading) {
        return;
      }

      setLoadingExpenses(true);
      setExpensesError(null);
      setExpensesWarning(null);

      if (!userId) {
        setTrips([]);
        setPayments([]);
        setSelectionExpenses([]);
        setExpensesError("You need to be signed in before viewing expenses.");
        setExpensesWarning(null);
        setLoadingExpenses(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setTrips([]);
        setPayments([]);
        setSelectionExpenses([]);
        setExpensesError("You need to be signed in before viewing expenses.");
        setExpensesWarning(null);
        setLoadingExpenses(false);
        return;
      }

      const response = await fetch("/api/my-expenses", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as ExpensesApiResponse;

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setTrips([]);
        setPayments([]);
        setSelectionExpenses([]);
        setExpensesError(result.error || "Unable to load expenses.");
        setExpensesWarning(null);
        setLoadingExpenses(false);
        return;
      }

      setTrips(result.trips ?? []);
      setPayments(result.payments ?? []);
      setSelectionExpenses(result.selectionExpenses ?? []);
      setExpensesWarning(result.warning ?? null);
      setLoadingExpenses(false);
    }

    void loadExpenses();

    return () => {
      mounted = false;
    };
  }, [loading, userId]);

  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);

  const expenseItems = useMemo<ExpenseItem[]>(() => {
    const paymentItems = payments.map((payment) => {
      const trip = payment.trip_id ? tripById.get(payment.trip_id) : null;
      const roleView: ExpenseRoleView = trip?.owner_id === userId ? "organiser" : "participant";
      const paymentLabel =
        typeof payment.metadata?.label === "string"
          ? payment.metadata.label
          : typeof payment.metadata?.name === "string"
            ? payment.metadata.name
            : "Trip expense";

      return {
        id: `payment-${payment.id}`,
        tripId: payment.trip_id,
        tripTitle: trip?.title || "Trip expense",
        roleView,
        label: paymentLabel,
        kind: "payment",
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        date: payment.paid_at || payment.created_at,
        meta: trip?.destination || null,
      };
    });

    const selectionItems = (selectionExpenses ?? []).map((selection) => {
      const trip = tripById.get(selection.trip_id);
      const roleView: ExpenseRoleView = trip?.owner_id === userId ? "organiser" : "participant";

      return {
        id: `selection-${selection.category}-${selection.id}`,
        tripId: selection.trip_id,
        tripTitle: trip?.title || "Trip selection",
        roleView,
        label: selection.title,
        kind: selection.category,
        status: roleView === "organiser" ? "selected by you" : "selected by organiser",
        amount: selection.amount,
        currency: selection.currency,
        date: null,
        meta: selection.location || selection.notes || trip?.destination || null,
      };
    });

    return [...paymentItems, ...selectionItems];
  }, [payments, selectionExpenses, tripById, userId]);

  const organiserExpenses = useMemo(
    () => expenseItems.filter((item) => item.roleView === "organiser"),
    [expenseItems],
  );

  const participantExpenses = useMemo(
    () => expenseItems.filter((item) => item.roleView === "participant"),
    [expenseItems],
  );

  const paidTotal = useMemo(
    () =>
      payments
        .filter((payment) => payment.status === "paid")
        .reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
    [payments],
  );

  const pendingTotal = useMemo(
    () =>
      payments
        .filter((payment) => payment.status !== "paid")
        .reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
    [payments],
  );

  const tripsWithExpenses = useMemo(
    () => new Set(expenseItems.map((item) => item.tripId).filter(Boolean)).size,
    [expenseItems],
  );

  return (
    <div className={styles.stack}>
      <section className={styles.grid3}>
        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Paid</p>
          <div className={styles.metricValue}>
            {loadingExpenses ? "..." : formatMoney(paidTotal, "GBP")}
          </div>
          <p className={styles.metricMeta}>Already paid across trips you’re connected to</p>
        </article>

        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Pending</p>
          <div className={styles.metricValue}>
            {loadingExpenses ? "..." : formatMoney(pendingTotal, "GBP")}
          </div>
          <p className={styles.metricMeta}>Still to pay or confirm</p>
        </article>

        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Trips</p>
          <div className={styles.metricValue}>
            {loadingExpenses ? "..." : tripsWithExpenses || trips.length}
          </div>
          <p className={styles.metricMeta}>Trips currently linked to your expense view</p>
        </article>
      </section>

      {loadingExpenses ? (
        <section className={styles.panel}>
          <p className={styles.muted}>Loading your trip expenses...</p>
        </section>
      ) : null}

      {expensesError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{expensesError}</p>
        </section>
      ) : null}

      {expensesWarning ? (
        <section className={styles.panel}>
          <div className={styles.callout}>
            <p className={styles.eyebrow}>Payments setup</p>
            <p>{expensesWarning}</p>
          </div>
        </section>
      ) : null}

      {!loadingExpenses && !expensesError && expenseItems.length === 0 ? (
        <section className={styles.panel}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>Connected trips</p>
              <h2>Your expense view is ready</h2>
            </div>
          </div>

          {trips.length > 0 ? (
            <div className={styles.simpleList}>
              {trips.map((trip) => (
                <div key={trip.id} className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{trip.title}</span>
                    <span className={styles.badgeSoft}>{trip.status}</span>
                  </div>
                  <div className={styles.tripMetaRow}>
                    <span>{trip.destination || "Destination to be confirmed"}</span>
                    <span>No expenses added yet</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h3>No trip expenses yet.</h3>
              <p>
                Once payments or trip costs are added to a trip you own or one you’ve been invited
                into, they’ll appear here.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {!loadingExpenses && !expensesError && organiserExpenses.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>Organiser</p>
              <h2>Expenses you’ve created as organiser</h2>
            </div>
          </div>

          <div className={styles.simpleList}>
            {organiserExpenses.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} />
            ))}
          </div>
        </section>
      ) : null}

      {!loadingExpenses && !expensesError && participantExpenses.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>Participant</p>
              <h2>Expenses linked to trips you joined</h2>
              <p className={styles.muted}>
                These are organiser selections from trips you’ve been invited into.
              </p>
            </div>
          </div>

          <div className={styles.simpleList}>
            {participantExpenses.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function MyExpensesPage() {
  return (
    <AppShell
      kicker="Expenses"
      title="My expenses."
      intro="See organiser-created trip costs and the selections linked to trips you’ve joined."
    >
      {(state) => <MyExpensesManager userId={state.userId} loading={state.loading} />}
    </AppShell>
  );
}
