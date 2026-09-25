"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";

type GlobalTemplate = { id: string; name: string; html: string; updatedAt: string | null; source: "database" | "default" };
type ChatMessage = { role: "user" | "assistant"; text: string };
type WebhookSettings = { configured: boolean; url: string; hasSecret: boolean; updatedAt: string | null; error?: string };

function previewTemplate(template: string) {
  return template
    .replaceAll("{email_subject}", "You have been invited to Summer in Lisbon")
    .replaceAll("{content}", "<p>Hi Alex, you have been invited to join Summer in Lisbon. Open Journi to view the trip and respond.</p>")
    .replaceAll("{action_url}", "#")
    .replaceAll("{action_label}", "View your invitation")
    .replaceAll("{logo_url}", "/journi-backoffice-logo.png");
}

export default function GlobalEmailTemplatePage() {
  const router = useRouter();
  const [template, setTemplate] = useState<GlobalTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<"sender" | "template" | "ai" | "preview">("sender");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "Tell me how you want the shared Journi email design to look or feel." }]);
  const [webhook, setWebhook] = useState<WebhookSettings>({ configured: false, url: "", hasSecret: false, updatedAt: null });
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookWorking, setWebhookWorking] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.access_token) { router.replace("/signin?next=/backoffice/notifications/global-email-template"); return; }
      const [response, webhookResponse] = await Promise.all([
        fetch("/api/backoffice/notifications/global-template", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch("/api/backoffice/email-webhook", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      const result = (await response.json()) as { template?: GlobalTemplate; error?: string };
      const webhookSettings = (await webhookResponse.json()) as WebhookSettings;
      if (!mounted) return;
      if (!response.ok || !result.template) setError(result.error || "Unable to load the global template.");
      else { setTemplate(result.template); setWebhook(webhookSettings); setTestRecipient(session.user.email || ""); }
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  async function save() {
    if (!template) return;
    setSaving(true); setMessage(null); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Sign in again before saving."); setSaving(false); return; }
    const response = await fetch("/api/backoffice/notifications/global-template", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(template) });
    const result = (await response.json()) as { template?: GlobalTemplate; error?: string };
    if (!response.ok || !result.template) setError(result.error || "Unable to save the global template.");
    else { setTemplate(result.template); setMessage("Global email template saved."); }
    setSaving(false);
  }

  async function improveWithAI(instruction = aiPrompt) {
    const prompt = instruction.trim();
    if (!template || !prompt || aiLoading) return;
    setAiMessages((current) => [...current, { role: "user", text: prompt }]);
    setAiPrompt(""); setAiLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setAiMessages((current) => [...current, { role: "assistant", text: "Please sign in again before using the AI assistant." }]); setAiLoading(false); return; }
    try {
      const response = await fetch("/api/backoffice/notifications/ai", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "global", instruction: prompt, title: template.name, audience: "All Journi email recipients", timing: "Used for every email", subject: "Global email wrapper", template: template.html }) });
      const result = (await response.json()) as { html?: string; summary?: string; error?: string };
      if (!response.ok || !result.html) throw new Error(result.error || "The global template could not be updated.");
      setTemplate({ ...template, html: result.html });
      setAiMessages((current) => [...current, { role: "assistant", text: `${result.summary || "I updated the global design."} Check the Preview tab, then save when you are happy.` }]);
    } catch (error) {
      setAiMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "The global template could not be updated." }]);
    } finally { setAiLoading(false); }
  }

  async function saveWebhook(clearSecret = false) {
    setWebhookWorking(true); setError(null); setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Sign in again before saving the webhook."); setWebhookWorking(false); return; }
    const response = await fetch("/api/backoffice/email-webhook", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: webhook.url, secret: webhookSecret, clearSecret }) });
    const result = (await response.json()) as { settings?: Omit<WebhookSettings, "configured">; error?: string };
    if (!response.ok || !result.settings) setError(result.error || "Unable to save the webhook.");
    else { setWebhook({ configured: true, ...result.settings }); setWebhookSecret(""); setMessage(clearSecret ? "Webhook token removed." : "Email webhook saved."); }
    setWebhookWorking(false);
  }

  async function sendTestEmail() {
    if (!template || !testRecipient.trim()) return;
    setWebhookWorking(true); setError(null); setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Sign in again before sending a test."); setWebhookWorking(false); return; }
    const html = previewTemplate(template.html).replaceAll("/journi-backoffice-logo.png", `${window.location.origin}/journi-backoffice-logo.png`);
    const response = await fetch("/api/backoffice/email-webhook/send-test", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: testRecipient, subject: "Journi global email template test", html }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error || "Unable to send the test email.");
    else setMessage(`Test email sent to ${testRecipient}.`);
    setWebhookWorking(false);
  }

  return <main className={styles.backoffice}>
    <BackofficeRail active="notifications" />
    <section className={styles.workspace}>
      <header className={styles.header}><div><p className={styles.kicker}>Email design system</p><h1>Global email template</h1><span>The shared wrapper used across Journi emails.</span></div><Link href="/backoffice#notifications" className={styles.exitLink}>Back to notifications</Link></header>
      {loading ? <section className={styles.loadingState}><span className={styles.spinner} /><div><strong>Loading global template</strong><p>Collecting the shared email design.</p></div></section> : null}
      {error ? <section className={styles.errorState}><strong>Template unavailable</strong><p>{error}</p></section> : null}
      {template ? <div className={styles.notificationPageLayout}>
        {message ? <p className={styles.inlineNotice}>{message}</p> : null}
        <div className={styles.notificationPageTabsBar}><div className={styles.notificationPageTabs} role="tablist"><button type="button" role="tab" aria-selected={activeTab === "sender"} className={activeTab === "sender" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("sender")}>Webhook sender</button><button type="button" role="tab" aria-selected={activeTab === "template"} className={activeTab === "template" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("template")}>Template</button><button type="button" role="tab" aria-selected={activeTab === "ai"} className={activeTab === "ai" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("ai")}>AI Assistant</button><button type="button" role="tab" aria-selected={activeTab === "preview"} className={activeTab === "preview" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("preview")}>Preview</button></div><button type="button" className={styles.rowActionButton} disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save global template"}</button></div>
        {activeTab === "sender" ? <section className={styles.notificationPagePanel} role="tabpanel"><div className={styles.editPanelHeader}><div><strong>Email webhook</strong><span>Enter the endpoint that should receive Journi email-send requests.</span></div><span className={webhook.configured ? styles.pillPositive : styles.pillWarning}>{webhook.configured ? "Configured" : "Not configured"}</span></div><div className={styles.webhookSenderPanel}><label><span>Webhook endpoint</span><input type="url" value={webhook.url} onChange={(event) => setWebhook({ ...webhook, url: event.target.value, configured: false })} placeholder="https://hooks.example.com/email" /></label><label><span>Bearer token <small>{webhook.hasSecret ? "A saved token is already in use" : "Optional"}</small></span><input type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={webhook.hasSecret ? "Leave blank to keep saved token" : "Optional secret token"} autoComplete="new-password" /></label><div className={styles.webhookActions}><button type="button" className={styles.rowActionButton} disabled={webhookWorking || !webhook.url.trim()} onClick={() => void saveWebhook(false)}>{webhookWorking ? "Saving" : "Save webhook"}</button>{webhook.hasSecret ? <button type="button" className={styles.rowAction} disabled={webhookWorking} onClick={() => void saveWebhook(true)}>Remove saved token</button> : null}</div>{webhook.configured ? <div className={styles.webhookTestSend}><label><span>Send test payload to</span><input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="name@example.com" /></label><button type="button" className={styles.rowActionButton} disabled={webhookWorking || !testRecipient.trim()} onClick={() => void sendTestEmail()}>{webhookWorking ? "Sending" : "Send test webhook"}</button></div> : null}<div className={styles.webhookPayloadNote}><strong>Payload sent to this endpoint</strong><code>{'{ "event": "email.send", "email": { "to", "subject", "html", "text", "templateId", "triggerKey" } }'}</code></div><p className={styles.webhookSenderNote}>Only HTTPS endpoints are accepted. Local and private network addresses are blocked.</p></div></section> : null}
        {activeTab === "template" ? <section className={styles.notificationPagePanel} role="tabpanel"><div className={styles.editPanelHeader}><div><strong>Global HTML wrapper</strong><span>Individual notifications are inserted into the content placeholders.</span></div></div><div className={styles.notificationTemplateBody}><label><span>Template name</span><input value={template.name} onChange={(event) => setTemplate({ ...template, name: event.target.value })} /></label><div className={styles.emailTemplateTools}><span>Required: {"{logo_url}"}, {"{email_subject}"}, {"{content}"}, {"{action_url}"}, {"{action_label}"}</span></div><textarea className={styles.emailTemplateCode} value={template.html} spellCheck={false} onChange={(event) => setTemplate({ ...template, html: event.target.value })} /></div></section> : null}
        {activeTab === "ai" ? <section className={styles.notificationPagePanel} role="tabpanel"><div className={styles.editPanelHeader}><div><strong>AI global-template assistant</strong><span>Ask for design, hierarchy, accessibility, branding, or copy-wrapper improvements.</span></div><span className={styles.aiBadge}>AI</span></div><section className={styles.aiTemplateAssistant}><div className={styles.aiChatMessages}>{aiMessages.map((item, index) => <p key={`${item.role}-${index}`} className={item.role === "user" ? styles.aiUserMessage : styles.aiAssistantMessage}>{item.text}</p>)}{aiLoading ? <p className={styles.aiAssistantMessage}>Redesigning the global template…</p> : null}</div><div className={styles.aiQuickActions}><button type="button" onClick={() => void improveWithAI("Make the global template feel more polished and premium")}>More premium</button><button type="button" onClick={() => void improveWithAI("Improve accessibility, spacing, and mobile email compatibility")}>Improve accessibility</button><button type="button" onClick={() => void improveWithAI("Simplify the global template and strengthen the Journi branding")}>Simplify design</button></div><form className={styles.aiChatComposer} onSubmit={(event) => { event.preventDefault(); void improveWithAI(); }}><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="e.g. Use a softer background, a more prominent logo area and a cleaner footer…" /><button type="submit" className={styles.rowActionButton} disabled={aiLoading || !aiPrompt.trim()}>{aiLoading ? "Working" : "Improve template"}</button></form></section></section> : null}
        {activeTab === "preview" ? <section className={styles.notificationPagePanel} role="tabpanel"><div className={styles.editPanelHeader}><div><strong>Global template preview</strong><span>Sample invitation content shows how notification details fit the shared design.</span></div><button type="button" className={styles.rowAction} onClick={() => setActiveTab("template")}>Edit template</button></div><iframe className={styles.emailTemplatePreviewFull} title="Global email template preview" sandbox="" srcDoc={previewTemplate(template.html)} /></section> : null}
      </div> : null}
    </section>
  </main>;
}
