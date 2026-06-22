export const audienceFilters = [
  { value: "adults_only", label: "Adults Only" },
  { value: "family_friendly", label: "Family Friendly" },
  { value: "couples", label: "Couples" },
  { value: "luxury", label: "Luxury" },
  { value: "adventure", label: "Adventure" },
  { value: "wellness", label: "Wellness" },
  { value: "seniors", label: "Seniors" },
  { value: "accessible", label: "Accessible" },
  { value: "pet_friendly", label: "Pet-Friendly" },
] as const;

export const groupSizeBands = [
  { value: "4-6", label: "4-6 people", minimum: 4 },
  { value: "6-10", label: "6-10 people", minimum: 6 },
  { value: "10+", label: "10+ people", minimum: 10 },
] as const;

export const budgetBands = [
  { value: "200-400", label: "£200-£400", min: 200, max: 400 },
  { value: "400-650", label: "£400-£650", min: 400, max: 650 },
  { value: "650+", label: "£650+", min: 650, max: null },
] as const;

export type AudienceFilter = (typeof audienceFilters)[number]["value"];
export type GroupSizeBand = (typeof groupSizeBands)[number]["value"];
export type BudgetBand = (typeof budgetBands)[number]["value"];
export type DateMode = "set_dates" | "flexible";
export type BudgetMode = "per_person" | "overall";

export function getAudienceLabel(audience?: string | null) {
  return audienceFilters.find((option) => option.value === audience)?.label ?? "Open to all";
}

export function getGroupSizeLabel(groupSize?: string | null) {
  return groupSizeBands.find((option) => option.value === groupSize)?.label ?? "Group size to confirm";
}

export function getBudgetBandLabel(budgetBand?: string | null) {
  return budgetBands.find((option) => option.value === budgetBand)?.label ?? "Budget to confirm";
}

export function getGroupSizeMinimum(groupSize?: string | null) {
  return groupSizeBands.find((option) => option.value === groupSize)?.minimum ?? 4;
}

export function getBudgetBandRange(budgetBand?: string | null) {
  const match = budgetBands.find((option) => option.value === budgetBand);

  if (!match) {
    return null;
  }

  return {
    min: match.min,
    max: match.max,
  };
}

export function deriveBudgetBandFromPerPerson(amount: number | null) {
  if (amount === null || Number.isNaN(amount)) {
    return "";
  }

  if (amount < 400) {
    return "200-400";
  }

  if (amount < 650) {
    return "400-650";
  }

  return "650+";
}

export function derivePerPersonBudgetFromTotal(totalBudget: number | null, groupSize?: string | null) {
  if (totalBudget === null || Number.isNaN(totalBudget)) {
    return null;
  }

  const minimumGroupSize = getGroupSizeMinimum(groupSize);

  if (!minimumGroupSize) {
    return null;
  }

  const perPersonAmount = totalBudget / minimumGroupSize;
  const budgetBand = deriveBudgetBandFromPerPerson(perPersonAmount);
  const range = getBudgetBandRange(budgetBand);

  return {
    amount: perPersonAmount,
    budgetBand,
    min: range?.min ?? null,
    max: range?.max ?? null,
  };
}

export function parseNumericInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : null;
}
