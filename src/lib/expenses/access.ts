import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ExpensePerson } from "./shared";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function databaseError(error: { code?: string; message: string }) {
  if (error.code === "P0001" && error.message === "Mark the affected split payment as due before changing its share.") {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  const missing = error.code === "42P01" || error.code === "PGRST205";
  console.error("Trip expenses database error", error.code, error.message);
  return NextResponse.json({ error: missing ? "Planned costs and bill splitting aren’t available yet. Please ask the organiser to contact support." : "Unable to save or load trip costs. Please try again." }, { status: missing ? 503 : 500 });
}
export async function getAccess(request: NextRequest, id: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { error: NextResponse.json({ error: "Sign in to view trip costs." }, { status: 401 }) };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: "Invalid session." }, { status: 401 }) };
  if (!isUuid(id)) return { error: NextResponse.json({ error: "Invalid trip." }, { status: 400 }) };
  const { data: trip, error: tripError } = await supabaseAdmin.from("trips").select("id,owner_id").eq("id", id).maybeSingle();
  if (tripError) return { error: databaseError(tripError) };
  if (!trip) return { error: NextResponse.json({ error: "Trip not found." }, { status: 404 }) };
  const { data: participants, error: participantError } = await supabaseAdmin.from("trip_participants").select("id,user_id,email,full_name,status,membership_status").eq("trip_id", id);
  if (participantError) return { error: databaseError(participantError) };
  const active = (participants || []).filter((person) => person.membership_status ? person.membership_status === "active" : person.status === "accepted");
  const isOwner = trip.owner_id === user.id;
  if (!isOwner && !active.some((person) => person.user_id === user.id || (!person.user_id && user.email && person.email?.toLowerCase() === user.email.toLowerCase()))) {
    return { error: NextResponse.json({ error: "Only the organiser and active travellers can access trip costs." }, { status: 403 }) };
  }
  const { data: owner, error: ownerError } = await supabaseAdmin.auth.admin.getUserById(trip.owner_id);
  if (ownerError || !owner.user) return { error: NextResponse.json({ error: "Unable to load trip travellers." }, { status: 500 }) };
  const people: ExpensePerson[] = [{ id: `user:${trip.owner_id}`, name: String(owner.user.user_metadata?.full_name || "Organiser") }];
  const seen = new Set([`user:${trip.owner_id}`, ...(owner.user.email ? [`email:${owner.user.email.toLowerCase()}`] : [])]);
  for (const person of active) {
    const personId = person.user_id ? `user:${person.user_id}` : `participant:${person.id}`;
    const emailKey = person.email ? `email:${person.email.toLowerCase()}` : "";
    if (seen.has(personId) || (emailKey && seen.has(emailKey))) continue;
    seen.add(personId);
    if (emailKey) seen.add(emailKey);
    people.push({ id: personId, name: person.full_name || person.email || "Traveller" });
  }
  // Keep participant IDs too: older splits may predate the traveller claiming their invite.
  const personIds = [`user:${user.id}`, ...active.filter((person) => person.user_id === user.id || (!person.user_id && user.email && person.email?.toLowerCase() === user.email.toLowerCase())).map((person) => `participant:${person.id}`)];
  return { user, isOwner, people, personIds };
}
