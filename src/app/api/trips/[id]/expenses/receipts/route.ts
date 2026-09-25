import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAccess, databaseError, isUuid } from "@/lib/expenses/access";
import { receiptMaxBytes, receiptType } from "@/lib/expenses/receipts";

type Context = { params: Promise<{ id: string }> };
const bucket = "expense-receipts";
export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  if (Number(request.headers.get("content-length")) > receiptMaxBytes + 65536) return NextResponse.json({ error: "Each receipt must be 10 MB or smaller." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const expenseId = form?.get("expenseId");
  const receiptId = form?.get("receiptId");
  const file = form?.get("file");
  if (!isUuid(expenseId) || !isUuid(receiptId) || !(file instanceof File)) return NextResponse.json({ error: "Choose a receipt file and expense." }, { status: 400 });
  if (!file.size || file.size > receiptMaxBytes) return NextResponse.json({ error: "Each receipt must be between 1 byte and 10 MB." }, { status: 400 });
  const { data: expense, error: expenseError } = await supabaseAdmin.from("trip_costs").select("created_by").eq("id", expenseId).eq("trip_id", id).maybeSingle();
  if (expenseError) return databaseError(expenseError);
  if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the organiser can attach receipts." }, { status: 403 });
  const { data: existing, error: lookupError } = await supabaseAdmin.from("trip_expense_receipts").select("id,expense_id,name,size,mime_type").eq("id", receiptId).eq("trip_id", id).maybeSingle();
  if (lookupError) return databaseError(lookupError);
  if (existing) return existing.expense_id === expenseId ? NextResponse.json({ receipt: existing }) : NextResponse.json({ error: "Receipt ID already in use." }, { status: 409 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = receiptType(bytes);
  if (!type) return NextResponse.json({ error: "Use a JPG, PNG, WebP image or PDF receipt." }, { status: 400 });
  const path = `${id}/${expenseId}/${receiptId}.${type.extension}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, bytes, { contentType: type.mime, upsert: false });
  if (uploadError) return NextResponse.json({ error: "Receipt upload failed. Please try again." }, { status: 500 });
  const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180) || `Receipt.${type.extension}`;
  const { data, error } = await supabaseAdmin.from("trip_expense_receipts").insert({ id: receiptId, trip_id: id, expense_id: expenseId, created_by: access.user.id, name, size: file.size, mime_type: type.mime, storage_path: path }).select("id,expense_id,name,size,mime_type").single();
  if (error) { await supabaseAdmin.storage.from(bucket).remove([path]); return databaseError(error); }
  return NextResponse.json({ receipt: data }, { status: 201 });
}

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  const receiptId = request.nextUrl.searchParams.get("receiptId");
  if (!isUuid(receiptId)) return NextResponse.json({ error: "Invalid receipt." }, { status: 400 });
  const { data: receipt, error } = await supabaseAdmin.from("trip_expense_receipts").select("expense_id,storage_path,name,mime_type").eq("id", receiptId).eq("trip_id", id).maybeSingle();
  if (error) return databaseError(error);
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  if (!access.isOwner) {
    const { data: assignedPayments, error: paymentError } = await supabaseAdmin.from("trip_expense_payments").select("payer").eq("trip_id", id).eq("expense_id", receipt.expense_id);
    if (paymentError) return databaseError(paymentError);
    if (!(assignedPayments || []).some((payment) => access.personIds.includes(payment.payer?.id))) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }
  const { data, error: downloadError } = await supabaseAdmin.storage.from(bucket).download(receipt.storage_path);
  if (downloadError || !data) return NextResponse.json({ error: "Unable to download this receipt." }, { status: 500 });
  return new Response(data, { headers: { "Content-Type": receipt.mime_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(receipt.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
