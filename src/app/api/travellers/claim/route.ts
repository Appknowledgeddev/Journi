import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    userId?: string;
    email?: string;
  };

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!userId || !email) {
    return NextResponse.json({ error: "Missing user linkage details." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("trip_participants")
    .update({ user_id: userId, status: "linked" })
    .eq("email", email)
    .is("user_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
