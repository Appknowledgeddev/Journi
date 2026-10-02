import { NextRequest, NextResponse } from "next/server";
import { supabaseServerPublic } from "@/lib/supabase/server";
import { getTripCreationAccess } from "@/lib/trip-creation-access";

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data: { user }, error } = await supabaseServerPublic.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    return NextResponse.json(await getTripCreationAccess(user, request.nextUrl.searchParams.get("checkout_session_id")), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to check your trip allowance. Please try again." }, { status: 503 });
  }
}
