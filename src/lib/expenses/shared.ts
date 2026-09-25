export const expenseCategories = { hotel: "Accommodation", activity: "Activities", transport: "Transport", dining: "Dining", other: "Other" } as const;
export type ExpenseCategory = keyof typeof expenseCategories;
export type SavedPlanningOption = { id: string; title: string; category: ExpenseCategory; amount: number | null; currency: string | null; location: string | null; notes?: string | null };
export type ExpensePrefill = { title: string; category: ExpenseCategory; amount: string; notes: string };
export function planningExpensePrefill(option: { id: string; title: string; category: ExpenseCategory; amount: number | null; currency: string | null; location: string | null; notes?: string | null }): ExpensePrefill {
  const hasPrice = option.amount !== null && Number.isFinite(Number(option.amount)) && Number(option.amount) > 0;
  const currency = option.currency?.trim().toUpperCase();
  const amount = hasPrice && currency === "GBP" && option.category !== "hotel" ? Number(option.amount).toFixed(2) : "";
  const priceNote = hasPrice ? `Saved price: ${Number(option.amount).toFixed(2)} ${currency || "(currency unspecified)"}${option.category === "hotel" ? " per night. Enter the full stay total in GBP." : amount ? "." : ". Enter the total in GBP."}` : "Enter the total in GBP.";
  return { title: option.title.slice(0, 160), category: option.category, amount, notes: [`Saved planning option: ${option.category}/${option.id}`, priceNote, option.location, option.notes].filter(Boolean).join("\n").slice(0, 2000) };
}
export type ExpensePerson = { id: string; name: string };
export type ExpenseShare = ExpensePerson & { amountMinor: number };
export type ExpenseReceipt = { id: string; expense_id: string; name: string; size: number; mime_type: string };
export type TripCost = {
  id: string; title: string; category: ExpenseCategory; amount_minor: number; currency: string;
  kind: "planned" | "bill"; notes: string; paid_by: ExpensePerson | null; shares: ExpenseShare[];
  split_method: "equal" | "custom"; created_by: string; created_at: string; canEdit: boolean;
  receipts?: ExpenseReceipt[];
  due_date?: string | null; payment_instructions?: string;
};
export type ExpensePayment = {
  id: string; expense_id: string; label: string; amount_minor: number; currency: string;
  due_date?: string | null; payment_instructions?: string; claimed_at?: string | null; canClaim?: boolean;
  payer: ExpensePerson; status: "due" | "paid"; paid_at: string | null;
  created_by: string; created_at: string; canEdit: boolean;
};
export type PaymentInput = { id: string; expenseId: string; label: string; amount: string; payerId: string; status: "due" | "paid" };
export type TripCostsResponse = { scope?: "trip" | "personal"; costs: TripCost[]; payments: ExpensePayment[]; people: ExpensePerson[]; defaultCurrency: string; error?: string };
export function validatePayment(input: PaymentInput, people: ExpensePerson[]) {
  if (!input || typeof input.label !== "string" || !input.label.trim() || input.label.trim().length > 160) throw new Error("Enter a payment name of up to 160 characters.");
  const amount = parseAmount(input.amount);
  if (amount <= 0) throw new Error("The payment must be greater than zero.");
  if (input.status !== "due" && input.status !== "paid") throw new Error("Choose unpaid or paid.");
  const payer = people.find((person) => person.id === input.payerId);
  if (!payer) throw new Error("Choose a payer from the trip’s active travellers.");
  return { label: input.label.trim(), amount_minor: amount, currency: "GBP", payer, status: input.status };
}
export function expensePaymentTotals(expenseId: string, payments: ExpensePayment[]) {
  return payments.filter((payment) => payment.expense_id === expenseId).reduce((total, payment) => ({
    paid: total.paid + (payment.status === "paid" ? payment.amount_minor : 0),
    unpaid: total.unpaid + (payment.status === "due" ? payment.amount_minor : 0),
    count: total.count + 1,
  }), { paid: 0, unpaid: 0, count: 0 });
}
export type CostInput = {
  dueDate?: string; paymentInstructions?: string;
  section?: "details" | "split";
  id: string; title: string; amount: string; category: ExpenseCategory; kind: "planned" | "bill";
  notes: string; paidById: string; splitMethod: "equal" | "custom";
  shares: Array<{ personId: string; amount?: string }>;
};
export function resizeExpenseShares(cost: TripCost, total: number): ExpenseShare[] {
  if (cost.kind !== "bill" || total === cost.amount_minor) return cost.shares;
  if (!cost.shares.length) throw new Error("Edit the bill split before changing its total.");
  if (cost.split_method === "equal") {
    const amounts = splitEqually(total, cost.shares.length);
    return cost.shares.map((share, index) => ({ ...share, amountMinor: amounts[index] }));
  }
  const previous = cost.shares.reduce((sum, share) => sum + BigInt(share.amountMinor), BigInt(0));
  if (previous <= BigInt(0)) throw new Error("Edit the bill split before changing its total.");
  const amounts = cost.shares.map((share, index) => {
    const weighted = BigInt(total) * BigInt(share.amountMinor);
    return { index, amount: Number(weighted / previous), remainder: weighted % previous };
  });
  let remaining = total - amounts.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...amounts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- <= 0) break;
    share.amount += 1;
  }
  return cost.shares.map((share, index) => ({ ...share, amountMinor: amounts[index].amount }));
}
export function parseAmount(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > 999999999) throw new Error("Amount is too large.");
  return minor;
}
export function splitEqually(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isInteger(count) || count < 1 || count > 500) throw new Error("Choose at least one traveller to split with.");
  return Array.from({ length: count }, (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0));
}
export function validateCost(input: CostInput, people: ExpensePerson[]) {
  if (!input || typeof input !== "object") throw new Error("Enter the cost details.");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) throw new Error("Enter a title of up to 160 characters.");
  if (typeof input.category !== "string" || !Object.prototype.hasOwnProperty.call(expenseCategories, input.category)) throw new Error("Choose a valid category.");
  if (!["planned", "bill"].includes(input.kind)) throw new Error("Choose planned cost or bill.");
  if (typeof input.notes !== "string" || input.notes.length > 2000) throw new Error("Notes must be under 2,000 characters.");
  const total = parseAmount(input.amount);
  if (total <= 0) throw new Error("The total must be greater than zero.");
  let shares: ExpenseShare[] = [];
  let paidBy: ExpensePerson | null = null;
  if (input.kind === "bill") {
    paidBy = people.find((person) => person.id === input.paidById) || null;
    if (input.paidById && !paidBy) throw new Error("Choose who paid from the trip’s active travellers.");
    if (!["equal", "custom"].includes(input.splitMethod)) throw new Error("Choose an equal or custom split.");
    if (!Array.isArray(input.shares) || !input.shares.length || input.shares.length > 500) throw new Error("Choose who shares this bill.");
    const ids = input.shares.map((share) => share?.personId);
    if (new Set(ids).size !== ids.length) throw new Error("Each traveller can only appear once.");
    const equal = splitEqually(total, ids.length);
    shares = input.shares.map((share, index) => {
      const person = people.find((item) => item.id === share.personId);
      if (!person) throw new Error("A selected traveller is no longer active in this trip.");
      return { ...person, amountMinor: input.splitMethod === "equal" ? equal[index] : parseAmount(share.amount) };
    });
    if (shares.reduce((sum, share) => sum + share.amountMinor, 0) !== total) throw new Error("The shares must add up exactly to the bill total.");
  }
  const dueDate = input.dueDate || null;
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10) !== dueDate)) throw new Error("Choose a valid payment due date.");
  if (input.paymentInstructions !== undefined && (typeof input.paymentInstructions !== "string" || input.paymentInstructions.length > 2000)) throw new Error("Payment instructions must be under 2,000 characters.");
  return { due_date: dueDate, payment_instructions: input.paymentInstructions?.trim() || "", title: input.title.trim(), amount_minor: total, currency: "GBP", category: input.category, kind: input.kind, notes: input.notes.trim(), paid_by: paidBy, shares, split_method: input.kind === "bill" ? input.splitMethod : "equal" };
}
