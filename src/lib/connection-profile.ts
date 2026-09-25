export type ConnectionProfile = {
  id: string; fullName: string; bio: string; avatarUrl: string;
  backgroundUrl: string; backgroundPattern: string;
  avatarPositionX: number; avatarPositionY: number;
  backgroundPositionX: number; backgroundPositionY: number;
};

export function connectionProfile(user: { id: string; user_metadata?: Record<string, unknown> }): ConnectionProfile | null {
  const metadata = user.user_metadata || {};
  const text = (key: string) => typeof metadata[key] === "string" ? metadata[key].trim() : "";
  const position = (key: string) => typeof metadata[key] === "number" && Number.isFinite(metadata[key]) ? Math.min(100, Math.max(0, metadata[key])) : 50;
  if (!text("full_name") || !text("bio")) return null;
  return {
    id: user.id, fullName: text("full_name"), bio: text("bio"), avatarUrl: text("avatar_url"),
    backgroundUrl: text("profile_background_url"), backgroundPattern: text("profile_background_pattern"),
    avatarPositionX: position("avatar_position_x"), avatarPositionY: position("avatar_position_y"),
    backgroundPositionX: position("background_position_x"), backgroundPositionY: position("background_position_y"),
  };
}
