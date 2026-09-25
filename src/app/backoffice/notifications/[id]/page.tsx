"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";

type NotificationRule = {
  id: string;
  title: string;
  triggerKey: string;
  audience: string;
  channel: string;
  sendTiming: string;
  subject: string;
  body: string;
  pushBody: string;
  customTemplate: string;
  templateMode: "global" | "custom";
  enabled: boolean;
  updatedAt: string | null;
  source: "database" | "default";
};

type ChatMessage = { role: "user" | "assistant"; text: string };

function escapeEmailText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function createEmailTemplate(message: string) {
  const content = escapeEmailText(message).replaceAll("\n", "<br />");
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#10203f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;padding:32px 16px;">
      <tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #dce4ee;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 32px;background:#10203f;color:#fff;font-size:22px;font-weight:700;">Journi</td></tr>
        <tr><td style="padding:36px 32px;"><h1 style="margin:0 0 18px;font-size:26px;color:#10203f;">{trip_title}</h1><p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#475569;">${content}</p><a href="{action_url}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#2c94f5;color:#fff;text-decoration:none;font-size:15px;font-weight:700;">Open Journi</a></td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:12px;">You are receiving this message because you are part of a trip on Journi.</td></tr>
      </table></td></tr>
    </table>
  </body>
</html>`;
}

function previewTemplate(template: string) {
  return template.replaceAll("{first_name}", "Alex").replaceAll("{participant_name}", "Alex Morgan").replaceAll("{trip_title}", "Summer in Lisbon").replaceAll("{action_url}", "#").replaceAll("{action_label}", "Open Journi").replaceAll("{logo_url}", "/journi-backoffice-logo.png");
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const notificationId = decodeURIComponent(params.id);
  const [rule, setRule] = useState<NotificationRule | null>(null);
  const [globalTemplate, setGlobalTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Tell me what you want this email to achieve, or ask me to improve the current template." },
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "ai" | "template" | "preview">("settings");
  const [editorChannel, setEditorChannel] = useState<"push" | "email">("email");

  useEffect(() => {
    setEditorChannel(new URLSearchParams(window.location.search).get("channel") === "push" ? "push" : "email");
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadRule() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.access_token) {
        router.replace(`/signin?next=${encodeURIComponent(`/backoffice/notifications/${notificationId}`)}`);
        return;
      }
      const [response, globalResponse] = await Promise.all([
        fetch("/api/backoffice/notifications", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch("/api/backoffice/notifications/global-template", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      const result = (await response.json()) as { notificationRules?: NotificationRule[]; error?: string };
      const globalResult = (await globalResponse.json()) as { template?: { html?: string } };
      if (!mounted) return;
      const match = result.notificationRules?.find((item) => item.id === notificationId);
      if (!response.ok || !match) setError(result.error || "Notification rule not found.");
      else { setRule(match); setGlobalTemplate(globalResult.template?.html || ""); setTestRecipient(session.user.email || ""); }
      setLoading(false);
    }
    void loadRule();
    return () => { mounted = false; };
  }, [notificationId, router]);

  function update(updates: Partial<NotificationRule>) {
    setRule((current) => current ? { ...current, ...updates } : current);
    setMessage(null);
  }

  async function save() {
    if (!rule) return;
    setSaving(true);
    setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Sign in with an admin account before saving."); setSaving(false); return; }
    const response = await fetch("/api/backoffice/notifications", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(rule) });
    const result = (await response.json()) as { notificationRule?: NotificationRule; error?: string };
    if (!response.ok || !result.notificationRule) setError(result.error || "Unable to save this notification rule.");
    else { setRule(result.notificationRule); setMessage("Notification saved."); setError(null); }
    setSaving(false);
  }

  async function improveWithAI(instruction = aiPrompt) {
    const prompt = instruction.trim();
    if (!rule || !prompt || aiLoading) return;
    setAiMessages((current) => [...current, { role: "user", text: prompt }]);
    setAiPrompt("");
    setAiLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setAiMessages((current) => [...current, { role: "assistant", text: "Please sign in again before using the AI assistant." }]); setAiLoading(false); return; }
    try {
      const response = await fetch("/api/backoffice/notifications/ai", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: rule.templateMode === "global" ? "content" : "notification", instruction: prompt, title: rule.title, audience: rule.audience, timing: rule.sendTiming, subject: rule.subject, template: rule.templateMode === "global" ? rule.body : rule.customTemplate }),
      });
      const result = (await response.json()) as { subject?: string; html?: string; summary?: string; error?: string };
      if (!response.ok || !result.subject || !result.html) throw new Error(result.error || "The template could not be updated.");
      update(rule.templateMode === "global" ? { subject: result.subject, body: result.html } : { subject: result.subject, customTemplate: result.html });
      setAiMessages((current) => [...current, { role: "assistant", text: `${result.summary || "I updated the subject and template."} Review the live preview, then save when you are happy.` }]);
    } catch (error) {
      setAiMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "The template could not be updated." }]);
    } finally {
      setAiLoading(false);
    }
  }

  async function sendTestEmail() {
    if (!rule || !testRecipient.trim() || testSending) return;
    setTestSending(true);
    setError(null);
    setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Sign in again before sending a test."); setTestSending(false); return; }
    const renderedHtml = previewTemplate(previewHtml).replaceAll("/journi-backoffice-logo.png", `${window.location.origin}/journi-backoffice-logo.png`);
    const response = await fetch("/api/backoffice/email-webhook/send-test", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: testRecipient, subject: previewTemplate(rule.subject), html: renderedHtml, templateId: rule.id, triggerKey: rule.triggerKey }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error || "Unable to send the test email.");
    else setMessage(`Test email sent to ${testRecipient}.`);
    setTestSending(false);
  }

  const isEmail = editorChannel === "email";
  const previewHtml = rule?.templateMode === "global"
    ? globalTemplate.replaceAll("{email_subject}", rule.subject).replaceAll("{content}", /<[^>]+>/.test(rule.body) ? rule.body : `<p>${rule.body}</p>`)
    : rule?.customTemplate || "";

  return (
    <main className={styles.backoffice}>
      <BackofficeRail active="notifications" />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div><p className={styles.kicker}>Notification template</p><h1>{rule?.title || "Notification details"}</h1><span>{rule?.triggerKey || "Loading notification rule"}</span></div>
          <Link href="/backoffice#notifications" className={styles.exitLink}>Back to notifications</Link>
        </header>
        {loading ? <section className={styles.loadingState}><span className={styles.spinner} /><div><strong>Loading notification</strong><p>Collecting the current delivery settings and template.</p></div></section> : null}
        {error ? <section className={styles.errorState}><strong>Notification unavailable</strong><p>{error}</p></section> : null}
        {rule ? (
          <div className={styles.notificationPageLayout}>
            {message ? <p className={styles.inlineNotice}>{message}</p> : null}
            <div className={styles.notificationPageTabsBar}>
              <div className={styles.notificationPageTabs} role="tablist" aria-label="Notification editor sections">
                <button type="button" role="tab" aria-selected={activeTab === "settings"} className={activeTab === "settings" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("settings")}>Settings</button>
                {isEmail ? <button type="button" role="tab" aria-selected={activeTab === "ai"} className={activeTab === "ai" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("ai")}>AI Assistant</button> : null}
                <button type="button" role="tab" aria-selected={activeTab === "template"} className={activeTab === "template" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("template")}>{isEmail ? "Template" : "Message"}</button>
                {isEmail ? <button type="button" role="tab" aria-selected={activeTab === "preview"} className={activeTab === "preview" ? styles.notificationPageTabActive : styles.notificationPageTab} onClick={() => setActiveTab("preview")}>Preview</button> : null}
              </div>
              <button type="button" className={styles.rowActionButton} disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save changes"}</button>
            </div>
            {activeTab === "settings" ? <section className={styles.notificationPagePanel} role="tabpanel">
              <div className={styles.editPanelHeader}><div><strong>Delivery settings</strong><span>Control who receives this notification and when.</span></div></div>
              <div className={styles.notificationSettingsGrid}>
                <label><span>Title</span><input value={rule.title} onChange={(event) => update({ title: event.target.value })} /></label>
                <label><span>Audience</span><input value={rule.audience} onChange={(event) => update({ audience: event.target.value })} /></label>
                <label><span>When sent</span><input value={rule.sendTiming} onChange={(event) => update({ sendTiming: event.target.value })} /></label>
                <label className={styles.notificationToggle}><span><strong>Enabled</strong><small>Allow this notification to be sent</small></span><input type="checkbox" checked={rule.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label>
              </div>
            </section> : null}
            {isEmail && activeTab === "ai" ? <section className={styles.notificationPagePanel} role="tabpanel">
              <div className={styles.editPanelHeader}><div><strong>AI template assistant</strong><span>Describe what you want to change and review the result before saving.</span></div><span className={styles.aiBadge}>AI</span></div>
              <section className={styles.aiTemplateAssistant}><div className={styles.aiAssistantHeader}><div><strong>Template conversation</strong><span>Changes are applied as a draft and are not saved automatically.</span></div></div><div className={styles.aiChatMessages}>{aiMessages.map((item, index) => <p key={`${item.role}-${index}`} className={item.role === "user" ? styles.aiUserMessage : styles.aiAssistantMessage}>{item.text}</p>)}{aiLoading ? <p className={styles.aiAssistantMessage}>Improving your template…</p> : null}</div><div className={styles.aiQuickActions}><button type="button" onClick={() => void improveWithAI("Make this email warmer and more concise")}>Warmer & concise</button><button type="button" onClick={() => void improveWithAI("Improve the hierarchy, accessibility, and call to action")}>Improve design</button><button type="button" onClick={() => void improveWithAI("Rewrite this email to make the next action clearer")}>Clarify action</button></div><form className={styles.aiChatComposer} onSubmit={(event) => { event.preventDefault(); void improveWithAI(); }}><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="e.g. Make this feel more welcoming and emphasise the voting deadline…" /><button type="submit" className={styles.rowActionButton} disabled={aiLoading || !aiPrompt.trim()}>{aiLoading ? "Working" : "Improve template"}</button></form></section>
            </section> : null}
            {activeTab === "template" ? <section className={styles.notificationPagePanel} role="tabpanel">
              <div className={styles.editPanelHeader}><div><strong>{isEmail ? "Email template" : "Push message"}</strong><span>{isEmail ? "Edit the HTML body used for this email." : "Write the short message shown inside Journi."}</span></div></div>
              <div className={styles.notificationTemplateBody}>
                {isEmail ? <div className={styles.templateModePicker}><div><strong>Template source</strong><span>Choose whether this email inherits the shared design or has its own.</span></div><div><button type="button" className={rule.templateMode === "global" ? styles.templateModeActive : styles.templateModeButton} onClick={() => update({ templateMode: "global" })}>Set to global</button><button type="button" className={rule.templateMode === "custom" ? styles.templateModeActive : styles.templateModeButton} onClick={() => update({ templateMode: "custom", customTemplate: rule.customTemplate || createEmailTemplate(rule.body) })}>Use custom template</button></div></div> : null}
                {isEmail ? <label><span>Email subject</span><input value={rule.subject} onChange={(event) => update({ subject: event.target.value })} /></label> : null}
                {isEmail ? <><div className={styles.emailTemplateTools}><span>{rule.templateMode === "global" ? "Only this content is sent into the {content} area of the global template." : <>Available: {"{first_name}"}, {"{participant_name}"}, {"{trip_title}"}, {"{action_url}"}</>}</span>{rule.templateMode === "global" ? <Link href="/backoffice/notifications/global-email-template" className={styles.rowAction}>View global template</Link> : null}</div><div className={styles.templatePaneLabel}><strong>{rule.templateMode === "global" ? "Email content" : "Custom HTML template"}</strong><span>Changes are reflected in the Preview tab</span></div><textarea className={rule.templateMode === "global" ? styles.emailContentEditor : styles.emailTemplateCode} value={rule.templateMode === "global" ? rule.body : rule.customTemplate} spellCheck={false} onChange={(event) => update(rule.templateMode === "global" ? { body: event.target.value } : { customTemplate: event.target.value })} /></> : null}
                {!isEmail ? <label><span>Message</span><textarea className={styles.pushMessageEditor} value={rule.pushBody} onChange={(event) => update({ pushBody: event.target.value })} /></label> : null}
              </div>
            </section> : null}
            {isEmail && activeTab === "preview" ? <section className={styles.notificationPagePanel} role="tabpanel">
              <div className={styles.editPanelHeader}><div><strong>Email preview</strong><span>See the complete message as the recipient will receive it, using example placeholder details.</span></div><button type="button" className={styles.rowAction} onClick={() => setActiveTab("template")}>Edit template</button></div>
              <div className={styles.previewSubjectLine}><span>Subject</span><strong>{previewTemplate(rule.subject) || "No subject set"}</strong></div>
              <iframe className={styles.emailTemplatePreviewFull} title="Email template preview" sandbox="" srcDoc={previewTemplate(previewHtml)} />
              <div className={styles.webhookTestSend}><label><span>Send a test email to</span><input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="name@example.com" /></label><button type="button" className={styles.rowActionButton} disabled={testSending || !testRecipient.trim()} onClick={() => void sendTestEmail()}>{testSending ? "Sending" : "Send test email"}</button></div>
            </section> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
