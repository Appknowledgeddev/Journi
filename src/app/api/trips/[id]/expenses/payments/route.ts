import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAccess, databaseError, isUuid } from "@/lib/expenses/access";
import { validatePayment, type PaymentInput } from "@/lib/expenses/shared";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  const input = await request.json().catch(() => null) as PaymentInput | null;
  if (!input || !isUuid(input.id) || !isUuid(input.expenseId)) return NextResponse.json({ error: "Choose an expense for this payment." }, { status: 400 });
  let values;
  try { values = validatePayment(input, access.people); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payment." }, { status: 400 }); }
  const { data: expense, error: expenseError } = await supabaseAdmin.from("trip_costs").select("id,created_by,due_date,payment_instructions").eq("trip_id", id).eq("id", input.expenseId).maybeSingle();
  if (expenseError) return databaseError(expenseError);
  if (!expense) return NextResponse.json({ error: "Expense not found in this trip." }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the organiser can add payments." }, { status: 403 });
  const { data: existing, error: existingError } = await supabaseAdmin.from("trip_expense_payments").select("*").eq("trip_id", id).eq("id", input.id).maybeSingle();
  if (existingError) return databaseError(existingError);
  if (existing) {
    if (existing.created_by !== access.user.id || existing.expense_id !== input.expenseId) return NextResponse.json({ error: "This payment ID is already in use." }, { status: 409 });
    return NextResponse.json({ payment: { ...existing, due_date: expense.due_date, payment_instructions: expense.payment_instructions, canEdit: true } });
  }
  const { data, error } = await supabaseAdmin.from("trip_expense_payments").insert({ ...values, id: input.id, trip_id: id, expense_id: input.expenseId, created_by: access.user.id, paid_at: values.status === "paid" ? new Date().toISOString() : null, confirmed_by: values.status === "paid" ? access.user.id : null }).select("*").single();
  if (error) return databaseError(error);
  return NextResponse.json({ payment: { ...data, due_date: expense.due_date, payment_instructions: expense.payment_instructions, canEdit: true } }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  const input = await request.json().catch(() => null);
  if (!input || !isUuid(input.id) || !["due", "paid"].includes(input.status)) return NextResponse.json({ error: "Choose unpaid or paid." }, { status: 400 });
  const { data: existing, error: lookupError } = await supabaseAdmin.from("trip_expense_payments").select("*").eq("trip_id", id).eq("id", input.id).maybeSingle();
  if (lookupError) return databaseError(lookupError);
  if (!existing) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  const { data: expense, error: expenseError } = await supabaseAdmin.from("trip_costs").select("created_by,due_date,payment_instructions").eq("trip_id", id).eq("id", existing.expense_id).maybeSingle();
  if (expenseError) return databaseError(expenseError);
  if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  const canClaim = !access.isOwner && access.personIds.includes(existing.payer?.id);
  if (!access.isOwner && !canClaim) return NextResponse.json({ error: "Only the organiser or the person assigned this payment can update it." }, { status: 403 });
  const { data, error } = await supabaseAdmin.rpc("update_trip_payment", { target_trip: id, target_payment: input.id, actor: access.user.id, paid: input.status === "paid" });
  if (error) return error.code === "P0001" ? NextResponse.json({ error: error.message }, { status: 409 }) : databaseError(error);
  return NextResponse.json({ payment: { ...data, due_date: expense.due_date, payment_instructions: expense.payment_instructions, canEdit: access.isOwner, canClaim } });
}
