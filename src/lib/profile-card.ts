import { CSSProperties } from "react";

export type ProfilePatternOption = {
  id: string;
  label: string;
  backgroundImage: string;
};

export const profileBackgroundPatterns: ProfilePatternOption[] = [
  {
    id: "ocean-glow",
    label: "Ocean glow",
    backgroundImage:
      "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.22), transparent 26%), linear-gradient(135deg, #2c94f5, #0f4e8a)",
  },
  {
    id: "sunset-wave",
    label: "Sunset wave",
    backgroundImage:
      "radial-gradient(circle at 50% -10%, rgba(255,214,153,0.4), transparent 28%), linear-gradient(135deg, #ff7a59, #c2410c)",
  },
  {
    id: "sand-stripe",
    label: "Sand stripe",
    backgroundImage:
      "linear-gradient(135deg, rgba(255,255,255,0.12) 25%, transparent 25%) 0 0/28px 28px, linear-gradient(135deg, #f2b26b, #cf6d2e)",
  },
  {
    id: "palm-night",
    label: "Palm night",
    backgroundImage:
      "radial-gradient(circle at 80% 18%, rgba(111,255,233,0.18), transparent 24%), linear-gradient(135deg, #183153, #0c7c87)",
  },
  {
    id: "confetti-sky",
    label: "Confetti sky",
    backgroundImage:
      "radial-gradient(circle at 22% 22%, rgba(255,255,255,0.3), transparent 12%), radial-gradient(circle at 78% 36%, rgba(255,205,112,0.22), transparent 16%), linear-gradient(135deg, #6bb8ff, #2c94f5 45%, #0f4e8a)",
  },
  {
    id: "soft-grid",
    label: "Soft grid",
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(135deg, #2c94f5, #123f71)",
  },
];

export function clampProfilePosition(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function resolveProfileBackgroundStyle({
  backgroundUrl,
  backgroundPattern,
  backgroundPositionX,
  backgroundPositionY,
}: {
  backgroundUrl: string;
  backgroundPattern?: string;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
}): CSSProperties {
  const pattern = profileBackgroundPatterns.find((option) => option.id === backgroundPattern);

  if (backgroundUrl) {
    return {
      backgroundImage: `url(${backgroundUrl})`,
      backgroundPosition: `${backgroundPositionX ?? 50}% ${backgroundPositionY ?? 50}%`,
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    };
  }

  if (pattern) {
    return {
      backgroundImage: pattern.backgroundImage,
      backgroundPosition: `${backgroundPositionX ?? 50}% ${backgroundPositionY ?? 50}%`,
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    };
  }

  return {};
}
