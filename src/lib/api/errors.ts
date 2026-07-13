export function getMissingSupabaseServerVariables() {
  return [
    !process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
    !process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter((value): value is string => Boolean(value));
}

export function databaseSetupError(missingVariables = getMissingSupabaseServerVariables()) {
  return [
    "Journi cannot save or load database records because the Supabase setup is incomplete.",
    `Add ${missingVariables.join(", ")} to your local environment, then restart the app.`,
  ].join(" ");
}

export function isDatabaseSchemaError(message: string) {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes("schema cache") ||
    lowerMessage.includes("column") ||
    lowerMessage.includes("relation") ||
    lowerMessage.includes("table") ||
    lowerMessage.includes("could not find")
  );
}

export function friendlyDatabaseError(message: string, action: string) {
  if (isDatabaseSchemaError(message)) {
    return [
      `Journi could not ${action} because the database is missing a table or field this feature needs.`,
      "Run the latest Supabase migration, refresh the schema cache if needed, then try again.",
    ].join(" ");
  }

  return `Journi could not ${action} right now. Please try again.`;
}
