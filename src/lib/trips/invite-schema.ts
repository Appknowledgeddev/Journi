// Only date_mode is optional. In particular, retain voting_deadline so expired
// invitation checks still apply when using the older trips schema.
export function isMissingTripDateMode(error: { code?: string; message: string } | null) {
  if (!error) return false;
  return (error.code === "42703" || error.code === "PGRST204") && /\bdate_mode\b/i.test(error.message);
}
