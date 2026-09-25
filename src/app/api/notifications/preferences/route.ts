import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
const defaults = { in_app: true, email: true, invites: true, planning: true, payments: true };
async function user(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}
export async function GET(request: NextRequest) {
  const current = await user(request);
  if (!current) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("notification_preferences").select("in_app,email,invites,planning,payments").eq("user_id", current.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load preferences." }, { status: 500 });
  return NextResponse.json({ preferences: data || defaults });
}
export async function PATCH(request: NextRequest) {
  const current = await user(request);
  if (!current) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!input || Object.keys(input).some(key => !Object.prototype.hasOwnProperty.call(defaults, key)) || Object.values(input).some(value => typeof value !== "boolean") || Object.keys(input).length !== Object.keys(defaults).length) return NextResponse.json({ error: "Choose valid notification preferences." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("notification_preferences").upsert({ user_id: current.id, ...input, updated_at: new Date().toISOString() }).select("in_app,email,invites,planning,payments").single();
  if (error) return NextResponse.json({ error: "Unable to save preferences." }, { status: 500 });
  return NextResponse.json({ preferences: data });
}
