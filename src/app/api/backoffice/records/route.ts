import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { logBackofficeActivity } from "@/lib/backoffice/activity";
import {
  isEditableTable,
  sanitiseBackofficeUpdates,
} from "@/lib/backoffice/editing";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const body = (await request.json()) as {
      table?: string;
      id?: string;
      updates?: unknown;
    };
    const table = body.table;
    const id = body.id;

    if (!table || !isEditableTable(table)) {
      return NextResponse.json({ error: "This table is not editable from the backoffice." }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: "Choose a record before saving changes." }, { status: 400 });
    }

    const updates = sanitiseBackofficeUpdates(table, body.updates);
    const { data, error } = await supabaseAdmin
      .from(table)
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.record.update",
      tableName: table,
      recordId: id,
      tripId: typeof data?.trip_id === "string" ? data.trip_id : null,
      summary: `Backoffice updated ${table.replaceAll("_", " ")} record ${id}`,
      metadata: { updates },
    });

    return NextResponse.json({ record: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this record.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "update this backoffice record") },
      { status: 500 },
    );
  }
}
