"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { FiUsers, FiX, FiEdit3, FiChevronDown } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import { expenseCategories, expensePaymentTotals, parseAmount, splitEqually, validateCost, type CostInput, type TripCost, type TripCostsResponse, type ExpensePrefill, type ExpensePayment, type ExpenseReceipt } from "@/lib/expenses/shared";
import { ExpenseReceiptList } from "./expense-receipt-list";
import { ExpenseDescription } from "./expense-description";
import { ReceiptUpload } from "./receipt-upload";
import { receiptMaxBytes } from "@/lib/expenses/receipts";
import { planningExpensePrefill, type SavedPlanningOption } from "@/lib/expenses/shared";
import { TripExpensePayments } from "./trip-expense-payments";
import styles from "./trip-expenses.module.css";
const shareColors = ["#3984ff", "#9860ff", "#16cba3", "#ffad36", "#f653a7", "#20bce6"];
const money = (minor: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);

export type TripCostsManagerHandle = { createFromOption: (prefill: ExpensePrefill) => boolean; updatePayment: (payment: ExpensePayment) => void };
export function TripCostsManager({ tripId, ref, onDataChange, onLoadReady, creationHost, onCreationChange, planningOptions = [] }: { tripId: string; ref?: Ref<TripCostsManagerHandle>; onDataChange?: (data: TripCostsResponse) => void; onLoadReady?: (ready: boolean) => void; creationHost?: HTMLElement | null; onCreationChange?: (open: boolean) => void; planningOptions?: SavedPlanningOption[] }) {
  const [data, setData] = useState<TripCostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<CostInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<"details" | "split">("details");
  const [saving, setSaving] = useState(false);
  const [closingPanel, setClosingPanel] = useState(false);
  const [paymentExpenseId, setPaymentExpenseId] = useState<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<Array<{ id: string; file: File }>>([]);
  const savedDraftId = useRef<string | null>(null);
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const creationTrigger = useRef<HTMLElement | null>(null);
  const creating = Boolean(draft && !editing);
  useEffect(() => { onCreationChange?.(creating); }, [creating, onCreationChange]);
  useImperativeHandle(ref, () => ({
    updatePayment(payment) {
      setData((current) => current ? { ...current, payments: [payment, ...current.payments.filter((item) => item.id !== payment.id)] } : current);
    },
    createFromOption(prefill) {
      if (draft || busy.current || paymentSaving) return false;
      setReceiptFiles([]); savedDraftId.current = null;
      creationTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onCreationChange?.(true);
      setSaveError(null); setEditing(false); setSection("details"); setClosingPanel(false); setPaymentExpenseId(null);
      setDraft({ ...prefill, id: crypto.randomUUID(), kind: "planned", paidById: "", splitMethod: "equal", shares: [] });
      return true;
    },
  }), [draft, paymentSaving, onCreationChange]);
  useEffect(() => { if (data) onDataChange?.(data); }, [data, onDataChange]);
  useEffect(() => { if (data || error) onLoadReady?.(true); }, [data, error, onLoadReady]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in to view trip costs.");
        const response = await fetch(`/api/trips/${tripId}/expenses`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: controller.signal });
        const result = await response.json() as TripCostsResponse;
        if (!response.ok) throw new Error(result.error || "Unable to load planned costs.");
        if (!controller.signal.aborted) { setData(result); setError(null); }
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load planned costs."); }
    }
    void load();
    return () => controller.abort();
  }, [tripId, revision]);
  const draftId = draft?.id;
  const dataReady = Boolean(data);
  useEffect(() => {
    if (draftId) {
      if (!editing && !creationHost) formRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
      formRef.current?.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: editing || Boolean(creationHost) });
    }
    // Focus when a form opens, without interrupting typing.
  }, [draftId, dataReady, section, editing, creationHost]);

  function open(nextSection: "details" | "split", cost?: TripCost) {
    if (!data || saving || paymentSaving) return;
    setReceiptFiles([]); savedDraftId.current = null;
    setSaveError(null); setEditing(Boolean(cost)); setSection(nextSection); setClosingPanel(false); setPaymentExpenseId(null);
    const equalAmounts = data.people.length ? splitEqually(cost?.amount_minor || 0, data.people.length) : [];
    const shares = nextSection === "split" ? data.people.map((person, index) => ({ personId: person.id, amount: ((cost?.kind === "bill" ? cost.shares.find((share) => share.id === person.id)?.amountMinor || 0 : equalAmounts[index]) / 100).toFixed(2) })) : cost?.shares.length ? cost.shares.filter((share) => data.people.some((person) => person.id === share.id)).map((share) => ({ personId: share.id, amount: (share.amountMinor / 100).toFixed(2) })) : data.people.map((person) => ({ personId: person.id, amount: "" }));
    setDraft({ dueDate: cost?.due_date || "", paymentInstructions: cost?.payment_instructions || "", id: cost?.id || crypto.randomUUID(), title: cost?.title || "", amount: cost ? (cost.amount_minor / 100).toFixed(2) : "", category: cost?.category || "other", kind: nextSection === "split" ? "bill" : cost?.kind || "planned", notes: cost?.notes || "", paidById: nextSection === "split" ? "" : cost?.paid_by && data.people.some((person) => person.id === cost.paid_by?.id) ? cost.paid_by.id : "", splitMethod: nextSection === "split" ? "custom" : cost?.split_method || "equal", shares });
  }
  function closeEditor() {
    if (editing || paymentExpenseId) {
      panelTrigger.current?.focus({ preventScroll: true });
      setClosingPanel(true);
    } else {
      setDraft(null); onCreationChange?.(false);
      requestAnimationFrame(() => creationTrigger.current?.focus({ preventScroll: true }));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !data || busy.current) return;
    setSaveError(null);
    try { validateCost(section === "details" ? { ...draft, kind: "planned" } : draft, data.people); }
    catch (caught) { setSaveError(caught instanceof Error ? caught.message : "Check the cost details."); return; }
    busy.current = true; setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to save this cost.");
      const response = await fetch(`/api/trips/${tripId}/expenses`, { method: editing || savedDraftId.current === draft.id ? "PATCH" : "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, section }) });
      const result = await response.json() as { cost?: TripCost; error?: string };
      if (!response.ok || !result.cost) throw new Error(result.error || "Unable to save this cost.");
      savedDraftId.current = draft.id;
      const cost = { ...result.cost, receipts: data.costs.find((item) => item.id === draft.id)?.receipts || [], canEdit: true };
      setData((current) => current ? { ...current, costs: [cost, ...current.costs.filter((item) => item.id !== cost.id)] } : current);
      for (const attachment of receiptFiles) {
        const form = new FormData();
        form.set("expenseId", cost.id); form.set("receiptId", attachment.id); form.set("file", attachment.file);
        const upload = await fetch(`/api/trips/${tripId}/expenses/receipts`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
        const uploaded = await upload.json() as { receipt?: ExpenseReceipt; error?: string };
        if (!upload.ok || !uploaded.receipt) throw new Error(`Expense saved, but ${attachment.file.name} was not attached. ${uploaded.error || "Try saving again to retry the upload."}`);
        const receipt = uploaded.receipt;
        setReceiptFiles((current) => current.filter((item) => item.id !== attachment.id));
        setData((current) => current ? { ...current, costs: current.costs.map((item) => item.id === cost.id ? { ...item, receipts: [...(item.receipts || []).filter((saved) => saved.id !== receipt.id), receipt] } : item) } : current);
      }
      closeEditor();
      setRevision((value) => value + 1);
    } catch (caught) { setSaveError(caught instanceof Error ? caught.message : "Unable to save this cost."); }
    finally { busy.current = false; setSaving(false); }
  }

  let preview: number[] = [];
  let splitTotal = 0;
  let splitValid = false;
  if (draft && section === "split") {
    try {
      const total = parseAmount(draft.amount);
      splitTotal = total;
      splitValid = true;
      preview = draft.splitMethod === "equal" ? splitEqually(total, draft.shares.length) : draft.shares.map((share) => {
        try { return parseAmount(share.amount); }
        catch { splitValid = false; return 0; }
      });
    } catch { /* Preview appears once a valid amount and selection are provided. */ }
  }

  const assignedTotal = preview.reduce((sum, amount) => sum + amount, 0);
  const splitDifference = splitTotal - assignedTotal;
  const barTotal = Math.max(splitTotal, assignedTotal, 1);

  const selectedPlanningOption = draft ? planningOptions.find((option) => draft.notes.startsWith(`Saved planning option: ${option.category}/${option.id}\n`)) : undefined;
  const editor = draft && data ? <form ref={formRef} className={`${styles.costForm} ${editing ? styles.inlineSplitForm : ""}`} onSubmit={save}>
      {section === "details" ? <div className={styles.sectionHead}><h3>{editing ? "Edit expense" : "Add expense"}</h3><button type="button" aria-label="Close cost form" disabled={saving || closingPanel} onClick={closeEditor}><FiX /></button></div> : null}
      <fieldset disabled={saving || closingPanel} className={styles.formFields}>
        {section === "details" ? <div className={styles.costFormGrid}>
          {!editing ? <label className={styles.wideField}>Saved planning option <span className={styles.optional}>(optional)</span><select value={selectedPlanningOption ? `${selectedPlanningOption.category}/${selectedPlanningOption.id}` : ""} onChange={(event) => {
            const option = planningOptions.find((item) => `${item.category}/${item.id}` === event.target.value);
            if (option) setDraft({ ...draft, ...planningExpensePrefill(option) });
            else setDraft({ ...draft, notes: draft.notes.replace(/^Saved planning option: [^\n]+\n/, "") });
            setSaveError(null);
          }}><option value="">Custom expense</option>{planningOptions.map((option) => <option key={`${option.category}/${option.id}`} value={`${option.category}/${option.id}`}>{option.title} · {expenseCategories[option.category]}</option>)}</select><span className={styles.receiptHint}>Choose an option to fill in its details, then review the total before saving.</span></label> : null}
          <label className={styles.wideField}>What’s it for?<input name="title" required maxLength={160} placeholder="e.g. Group dinner" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>Total (£)<input required type="text" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
          <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as CostInput["category"] })}>{Object.entries(expenseCategories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label>Payment due date<input type="date" value={draft.dueDate || ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
          <label className={styles.wideField}>Payment instructions<textarea rows={2} maxLength={2000} placeholder="How and where to pay" value={draft.paymentInstructions || ""} onChange={(event) => setDraft({ ...draft, paymentInstructions: event.target.value })} /></label>
          <label className={styles.wideField}>Notes <span className={styles.optional}>(optional)</span><textarea rows={2} maxLength={2000} value={draft.notes} placeholder="Booking details, dates or anything useful" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          <div className={styles.wideField}>
            <ReceiptUpload disabled={saving || closingPanel} onFiles={(files) => {
              if (files.some((file) => !file.size || file.size > receiptMaxBytes || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type))) { setSaveError("Choose JPG, PNG, WebP or PDF receipts, up to 10 MB each."); return; }
              setSaveError(null); setReceiptFiles((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
            }} />
            {receiptFiles.length ? <ul className={styles.receiptQueue}>{receiptFiles.map((attachment) => <li key={attachment.id}><span>{attachment.file.name}</span><button type="button" aria-label={`Remove ${attachment.file.name}`} onClick={() => setReceiptFiles((current) => current.filter((item) => item.id !== attachment.id))}><FiX /></button></li>)}</ul> : null}
            <ExpenseReceiptList tripId={tripId} receipts={data.costs.find((cost) => cost.id === draft.id)?.receipts || []} />
          </div>
          {draft.kind === "bill" ? <p className={`${styles.hint} ${styles.wideField}`}>Changing the total recalculates the existing split {draft.splitMethod === "equal" ? "equally" : "in the same proportions"}. Use Edit split to adjust each traveller’s share.</p> : null}
        </div> : null}
        {section === "split" ? <div className={styles.splitForm}>
          <div className={styles.splitHeading}><span>Adjust each person’s share</span><button type="button" onClick={() => {
            const amounts = splitEqually(parseAmount(draft.amount), draft.shares.length);
            setDraft({ ...draft, splitMethod: "equal", shares: draft.shares.map((share, index) => ({ ...share, amount: (amounts[index] / 100).toFixed(2) })) });
            setSaveError(null);
          }}>Split equally</button></div>
          <div className={styles.shareBar} role="img" aria-label={splitValid ? `Split proportions: ${data.people.map((person, index) => `${person.name} ${((preview[index] || 0) / splitTotal * 100).toFixed(1)}%`).join(", ")}${splitDifference > 0 ? `, ${money(splitDifference)} unassigned` : splitDifference < 0 ? `, ${money(-splitDifference)} over total` : ""}` : "Enter valid amounts to preview the split"}>
            {preview.map((amount, index) => <span key={draft.shares[index].personId} data-separated={amount > 0 && preview.slice(0, index).some((value) => value > 0)} style={{ width: `${amount / barTotal * 100}%`, backgroundColor: shareColors[index % shareColors.length], animationDelay: `${index * -0.35}s` }} />)}
          </div>
          <div className={styles.splitPeople}>{data.people.map((person, index) => <div className={styles.splitPerson} key={person.id}>
            <label><span className={styles.shareDot} style={{ backgroundColor: shareColors[index % shareColors.length] }} /><span>{person.name}<small>{splitValid ? `${((preview[index] || 0) / splitTotal * 100).toFixed(1)}%` : "—"}</small></span></label>
            <input aria-label={`Share for ${person.name} (£)`} required inputMode="decimal" placeholder="0.00" value={draft.shares[index]?.amount || ""} onChange={(event) => {
              setDraft({ ...draft, splitMethod: "custom", shares: draft.shares.map((share, i) => i === index ? { ...share, amount: event.target.value } : share) }); setSaveError(null);
            }} />
          </div>)}</div>
          <p className={styles.splitBalance} aria-live="polite">{!splitValid ? "Enter valid amounts for each person." : splitDifference === 0 ? "All allocated" : splitDifference > 0 ? `${money(splitDifference)} left to assign` : `${money(-splitDifference)} over the total`}</p>
        </div> : null}
      </fieldset>
      {saveError ? <p className={styles.formError} role="alert">{saveError}</p> : null}
      <div className={styles.costActions}><button type="submit" disabled={saving || closingPanel || (section === "split" && (!splitValid || splitDifference !== 0))} className={styles.accentButton}>{saving ? "Saving…" : section === "split" ? "Save split" : "Save expense"}</button><button type="button" disabled={saving || closingPanel} onClick={closeEditor}>Cancel</button></div>
    </form> : null;

  return <section className={styles.expenseSection}>
    <h2 className={styles.srOnly}>Expenses</h2>
    {error ? <p className={styles.notice} role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p> : !data ? <p className={styles.empty} role="status">Loading planned costs…</p> : null}
    {!editing && !paymentExpenseId ? creationHost ? createPortal(editor, creationHost) : editor : null}
    {data ? <>
      {data.costs.length ? <div className={`${styles.expenseList} ${styles.expenseCards}`}>{data.costs.map((cost) => {
        const totals = expensePaymentTotals(cost.id, data.payments);
        const displayAmount = data.scope === "personal" ? totals.paid + totals.unpaid : cost.amount_minor;
        return <article className={styles.savedCost} key={cost.id}>
        <div className={styles.expenseLine}><strong>{cost.title}<small className={styles.expenseCategory}>{expenseCategories[cost.category]}</small></strong><span className={styles.price}>{data.scope === "personal" ? <small>Your share </small> : null}{money(displayAmount)}</span></div>{cost.notes ? <ExpenseDescription key={cost.notes} text={cost.notes} /> : null}
        <ExpenseReceiptList tripId={tripId} receipts={cost.receipts || []} />
        <div className={styles.expensePayments}><span>Paid {money(totals.paid)} · {totals.paid > displayAmount ? `Overpaid ${money(totals.paid - displayAmount)}` : `Remaining ${money(displayAmount - totals.paid)}`}</span></div>
        {cost.kind === "bill" && data.scope !== "personal" ? <details className={styles.shareDetails}><summary>{cost.shares.length} {cost.shares.length === 1 ? "share" : "shares"}{cost.paid_by ? ` · Paid by ${cost.paid_by.name}` : ""}</summary><ul>{cost.shares.map((share) => <li key={share.id}><span>{share.name}{cost.paid_by ? <small>{share.id === cost.paid_by.id ? "Own share" : `Owes ${cost.paid_by.name}`}</small> : null}</span><strong>{money(share.amountMinor)}</strong></li>)}</ul></details> : null}
        <div className={styles.costActions}>
          <button type="button" disabled={saving || paymentSaving} aria-expanded={paymentExpenseId === cost.id && !closingPanel} aria-controls={`expense-panel-${cost.id}`} onClick={(event) => {
            if (closingPanel) return;
            panelTrigger.current = event.currentTarget;
            if (paymentExpenseId === cost.id) closeEditor();
            else { setDraft(null); setPaymentExpenseId(cost.id); setClosingPanel(false); }
          }}>Payments ({totals.count})<FiChevronDown className={styles.disclosureChevron} aria-hidden="true" /></button>
          {cost.canEdit ? <>
            <button type="button" disabled={saving || paymentSaving} aria-expanded={section === "details" && draft?.id === cost.id && !closingPanel} aria-controls={`expense-panel-${cost.id}`} onClick={(event) => {
              if (closingPanel) return;
              panelTrigger.current = event.currentTarget;
              if (section === "details" && draft?.id === cost.id) closeEditor(); else open("details", cost);
            }}><FiEdit3 /> Edit expense<FiChevronDown className={styles.disclosureChevron} aria-hidden="true" /></button>
            <button type="button" disabled={saving || paymentSaving} aria-expanded={section === "split" && draft?.id === cost.id && !closingPanel} aria-controls={`expense-panel-${cost.id}`} onClick={(event) => {
              if (closingPanel) return;
              panelTrigger.current = event.currentTarget;
              if (section === "split" && draft?.id === cost.id) closeEditor(); else open("split", cost);
            }}><FiUsers /> {cost.kind === "bill" ? "Edit split" : "Split bill"}<FiChevronDown className={styles.disclosureChevron} aria-hidden="true" /></button>
          </> : null}
        </div>
        {(editing && draft?.id === cost.id) || paymentExpenseId === cost.id ? <div key={paymentExpenseId ? "payments" : section} id={`expense-panel-${cost.id}`} className={`${styles.splitReveal} ${closingPanel ? styles.splitRevealClosing : ""}`} inert={closingPanel} onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (closingPanel) { setDraft(null); setPaymentExpenseId(null); setClosingPanel(false); }
          else {
            event.currentTarget.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
            if (paymentExpenseId) event.currentTarget.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
          }
        }}><div className={styles.splitRevealInner}>{paymentExpenseId === cost.id ? <TripExpensePayments tripId={tripId} data={data} expenseId={cost.id} embedded onClose={closeEditor} onBusyChange={setPaymentSaving} onSaved={(payment) => setData((current) => current ? { ...current, payments: [payment, ...current.payments.filter((item) => item.id !== payment.id)] } : current)} /> : editor}</div></div> : null}
      </article>; })}</div> : <p className={styles.empty}>No costs added yet. Add your first expense, then record payments or split the bill.</p>}
    </> : null}
  </section>;
}
