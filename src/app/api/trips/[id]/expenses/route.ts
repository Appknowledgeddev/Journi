import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateCost, resizeExpenseShares, type CostInput, type TripCost } from "@/lib/expenses/shared";

import { getAccess, databaseError, isUuid } from "@/lib/expenses/access";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  const { data, error } = await supabaseAdmin.from("trip_costs").select("*").eq("trip_id", id).order("created_at", { ascending: false });
  if (error) return databaseError(error);
  const { data: payments, error: paymentsError } = await supabaseAdmin.from("trip_expense_payments").select("*").eq("trip_id", id).order("created_at", { ascending: false });
  if (paymentsError) return databaseError(paymentsError);
  const { data: receipts, error: receiptsError } = await supabaseAdmin.from("trip_expense_receipts").select("id,expense_id,name,size,mime_type").eq("trip_id", id);
  if (receiptsError) return databaseError(receiptsError);
  const visiblePayments = (payments || []).filter((payment) => access.isOwner || access.personIds.includes(payment.payer?.id));
  const assignedExpenseIds = new Set(visiblePayments.map((payment) => payment.expense_id));
  const costs = (data || []).filter((cost) => access.isOwner || assignedExpenseIds.has(cost.id));
  return NextResponse.json({
    scope: access.isOwner ? "trip" : "personal",
    payments: visiblePayments.map((payment) => ({ ...payment, due_date: costs.find((cost) => cost.id === payment.expense_id)?.due_date, payment_instructions: costs.find((cost) => cost.id === payment.expense_id)?.payment_instructions, canClaim: !access.isOwner && access.personIds.includes(payment.payer?.id), canEdit: access.isOwner })),
    costs: costs.map((row) => ({ ...row,
      shares: access.isOwner ? row.shares : (row.shares || []).filter((share: { id: string }) => access.personIds.includes(share.id)),
      paid_by: access.isOwner ? row.paid_by : null,
      receipts: (receipts || []).filter((receipt) => receipt.expense_id === row.id),
      canEdit: access.isOwner,
    })),
    people: access.isOwner ? access.people : access.people.filter((person) => access.personIds.includes(person.id)),
    defaultCurrency: "GBP",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

async function save(request: NextRequest, context: Context, updating: boolean) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  if (!access.isOwner) return NextResponse.json({ error: "Only the organiser can edit expenses." }, { status: 403 });
  const input = await request.json().catch(() => null) as CostInput | null;
  if (!input || !isUuid(input.id)) return NextResponse.json({ error: "Invalid cost details." }, { status: 400 });
  const { data: existing, error: lookupError } = await supabaseAdmin.from("trip_costs").select("*").eq("id", input.id).eq("trip_id", id).maybeSingle();
  if (lookupError) return databaseError(lookupError);
  let values;
  try {
    if (updating && existing && input.section === "details") {
      const details = validateCost({ ...input, kind: "planned" }, access.people);
      values = { due_date: details.due_date, payment_instructions: details.payment_instructions, title: details.title, amount_minor: details.amount_minor, category: details.category, notes: details.notes, shares: resizeExpenseShares(existing as TripCost, details.amount_minor) };
    } else if (updating && existing && input.section === "split") {
      const split = validateCost({ ...input, kind: "bill", title: existing.title, amount: (existing.amount_minor / 100).toFixed(2), category: existing.category, notes: existing.notes }, access.people);
      values = { kind: split.kind, paid_by: split.paid_by, shares: split.shares, split_method: split.split_method };
    } else {
      values = validateCost(input, access.people);
    }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid cost details." }, { status: 400 }); }
  if (updating) {
    if (!existing) return NextResponse.json({ error: "Cost not found." }, { status: 404 });
    if (!access.isOwner && existing.created_by !== access.user.id) return NextResponse.json({ error: "Only the creator or organiser can change this cost." }, { status: 403 });
    const { data, error } = await supabaseAdmin.from("trip_costs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", input.id).eq("trip_id", id).select("*").single();
    if (error) return databaseError(error);
    return NextResponse.json({ cost: data });
  }
  if (existing) {
    if (existing.created_by !== access.user.id) return NextResponse.json({ error: "This cost ID is already in use." }, { status: 409 });
    return NextResponse.json({ cost: existing });
  }
  const { data, error } = await supabaseAdmin.from("trip_costs").insert({ ...values, id: input.id, trip_id: id, created_by: access.user.id }).select("*").single();
  if (error) return databaseError(error);
  return NextResponse.json({ cost: data }, { status: 201 });
}
export async function POST(request: NextRequest, context: Context) { return save(request, context, false); }
export async function PATCH(request: NextRequest, context: Context) { return save(request, context, true); }
