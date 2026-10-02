/** Some Natural Earth features have no numeric ID; names identify those entries. */
export function worldCountryId(id: unknown, name: string): string {
  const value = typeof id === "string" || typeof id === "number" ? String(id).trim() : "";
  // Older filters also truncated the literal "undefined" to eight characters.
  return value && value !== "undefined" && value !== "undefine" ? value : `name:${name}`;
}
