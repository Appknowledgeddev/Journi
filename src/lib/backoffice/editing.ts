export type EditableTable =
  | "trips"
  | "trip_participants"
  | "hotels"
  | "activities"
  | "transport"
  | "dining"
  | "payments"
  | "comments"
  | "polls"
  | "options"
  | "poll_options";

const editableColumnsByTable: Record<EditableTable, Set<string>> = {
  trips: new Set([
    "title",
    "destination",
    "description",
    "status",
    "visibility",
    "starts_at",
    "ends_at",
    "voting_deadline",
    "trip_type_label",
    "audience_filter",
    "date_mode",
    "group_size_band",
    "budget_mode",
    "budget_band",
    "budget_total",
    "budget_per_person_min",
    "budget_per_person_max",
    "cover_image_url",
  ]),
  trip_participants: new Set([
    "email",
    "full_name",
    "role",
    "status",
    "membership_status",
    "attendance_status",
    "request_message",
  ]),
  hotels: new Set([
    "name",
    "location",
    "booking_url",
    "price_per_night",
    "currency",
    "rating",
    "google_place_id",
  ]),
  activities: new Set([
    "title",
    "location",
    "booking_url",
    "scheduled_for",
    "price",
    "currency",
    "google_place_id",
  ]),
  transport: new Set([
    "mode",
    "provider",
    "departure_location",
    "arrival_location",
    "departs_at",
    "arrives_at",
    "price",
    "currency",
  ]),
  dining: new Set([
    "name",
    "location",
    "reservation_url",
    "scheduled_for",
    "cuisine",
    "price_level",
  ]),
  payments: new Set(["status", "amount", "currency", "paid_at"]),
  comments: new Set(["entity_type", "body"]),
  polls: new Set(["title", "description", "allows_multiple", "closes_at"]),
  options: new Set(["category", "title", "description"]),
  poll_options: new Set(["label"]),
};

const nullableColumns = new Set([
  "destination",
  "description",
  "starts_at",
  "ends_at",
  "voting_deadline",
  "trip_type_label",
  "audience_filter",
  "date_mode",
  "group_size_band",
  "budget_mode",
  "budget_band",
  "cover_image_url",
  "booking_url",
  "scheduled_for",
  "departs_at",
  "arrives_at",
  "reservation_url",
  "paid_at",
  "closes_at",
  "request_message",
  "google_place_id",
  "location",
  "currency",
  "cuisine",
]);

const numericColumns = new Set([
  "budget_total",
  "budget_per_person_min",
  "budget_per_person_max",
  "price_per_night",
  "rating",
  "price",
  "price_level",
  "amount",
]);

const booleanColumns = new Set(["allows_multiple"]);

export function isEditableTable(table: string): table is EditableTable {
  return table in editableColumnsByTable;
}

export function sanitiseBackofficeUpdates(table: EditableTable, updates: unknown) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("No editable fields were provided.");
  }

  const allowedColumns = editableColumnsByTable[table];
  const sanitised: Record<string, string | number | boolean | null> = {};

  for (const [column, rawValue] of Object.entries(updates)) {
    if (!allowedColumns.has(column)) {
      continue;
    }

    if (rawValue === "" && nullableColumns.has(column)) {
      sanitised[column] = null;
      continue;
    }

    if (numericColumns.has(column)) {
      if (rawValue === "" || rawValue === null || rawValue === undefined) {
        sanitised[column] = null;
        continue;
      }

      const numberValue = Number(rawValue);

      if (Number.isNaN(numberValue)) {
        throw new Error(`${column.replaceAll("_", " ")} must be a number.`);
      }

      sanitised[column] = numberValue;
      continue;
    }

    if (booleanColumns.has(column)) {
      sanitised[column] = Boolean(rawValue);
      continue;
    }

    if (rawValue === null) {
      sanitised[column] = nullableColumns.has(column) ? null : "";
      continue;
    }

    sanitised[column] = String(rawValue);
  }

  if (Object.keys(sanitised).length === 0) {
    throw new Error("No editable fields were provided.");
  }

  return sanitised;
}
