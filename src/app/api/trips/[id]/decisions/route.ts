import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAccess, isUuid } from "@/lib/expenses/access";
const categories = ["hotels", "activities", "transport", "dining"] as const;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  const results = await Promise.all([
    supabaseAdmin.from("trip_decisions").select("*").eq("trip_id", id),
    supabaseAdmin.from("trip_decision_history").select("category,option_id,action,reason,created_at").eq("trip_id", id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("trips").select("voting_deadline,status").eq("id", id).single(),
    ...categories.map(category => supabaseAdmin.from(category).select(category === "activities" ? "id,title" : category === "transport" ? "id,mode" : "id,name").eq("trip_id", id)),
  ]);
  if (results.some(result => result.error)) return NextResponse.json({ error: "Unable to load decisions." }, { status: 500 });
  return NextResponse.json({ isOwner: access.isOwner, decisions: results[0].data, history: results[1].data, trip: results[2].data, options: Object.fromEntries(categories.map((category, index) => [category, results[index + 3].data])) });
}
export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await getAccess(request, id);
  if (access.error) return access.error;
  if (!access.isOwner) return NextResponse.json({ error: "Only the organiser can change decisions." }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (input?.action === "cancel") {
    if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > 1000) return NextResponse.json({ error: "Explain why the trip is cancelled." }, { status: 400 });
    const { error } = await supabaseAdmin.rpc("cancel_trip", { target_trip: id, actor: access.user.id, reason: input.reason });
    if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Unable to cancel this trip." }, { status: 409 });
    return NextResponse.json({ saved: true });
  }
  if (!input || !categories.includes(input.category) || (input.optionId !== null && !isUuid(input.optionId)) || typeof input.reason !== "string" || input.reason.length > 1000) return NextResponse.json({ error: "Choose a decision and add a reason of up to 1,000 characters." }, { status: 400 });
  if (input.optionId === null && (!input.deadline || !Number.isFinite(Date.parse(input.deadline)) || Date.parse(input.deadline) <= Date.now())) return NextResponse.json({ error: "Choose a future voting deadline." }, { status: 400 });
  const { error } = await supabaseAdmin.rpc("set_trip_decision", { target_trip: id, target_category: input.category, target_option: input.optionId, actor: access.user.id, change_reason: input.reason, reopen_until: input.optionId === null ? input.deadline : null });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Unable to update this decision." }, { status: 409 });
  return NextResponse.json({ saved: true });
}
