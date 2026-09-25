import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { supabaseAdmin } from "@/lib/supabase/server";

const SETTINGS_ID = "primary";

function key() {
  const secret = process.env.EMAIL_WEBHOOK_ENCRYPTION_KEY;
  if (!secret) throw new Error("EMAIL_WEBHOOK_ENCRYPTION_KEY is required when using a webhook token.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("The stored webhook token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === "::1" || value === "0.0.0.0" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

export async function validateWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid webhook URL."); }
  if (url.protocol !== "https:") throw new Error("Webhook URLs must use HTTPS.");
  if (url.username || url.password) throw new Error("Credentials must not be included in the webhook URL.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Local webhook addresses are not allowed.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("Private or local webhook addresses are not allowed.");
  return url.toString();
}

export async function loadEmailWebhook() {
  const { data, error } = await supabaseAdmin.from("email_delivery_settings").select("webhook_url,webhook_secret_encrypted,updated_at").eq("id", SETTINGS_ID).maybeSingle();
  if (error || !data) return null;
  return { url: String(data.webhook_url), secret: data.webhook_secret_encrypted ? decrypt(String(data.webhook_secret_encrypted)) : null, hasSecret: Boolean(data.webhook_secret_encrypted), updatedAt: String(data.updated_at) };
}

export async function saveEmailWebhook(url: string, secret?: string, clearSecret?: boolean) {
  const safeUrl = await validateWebhookUrl(url);
  const current = await loadEmailWebhook();
  const encryptedSecret = clearSecret ? null : secret?.trim() ? encrypt(secret.trim()) : current?.secret ? encrypt(current.secret) : null;
  const { data, error } = await supabaseAdmin.from("email_delivery_settings").upsert({ id: SETTINGS_ID, provider: "webhook", webhook_url: safeUrl, webhook_secret_encrypted: encryptedSecret, updated_at: new Date().toISOString() }).select("webhook_url,webhook_secret_encrypted,updated_at").single();
  if (error) throw error;
  return { url: String(data.webhook_url), hasSecret: Boolean(data.webhook_secret_encrypted), updatedAt: String(data.updated_at) };
}

export async function sendEmailWebhook(payload: { to: string; subject: string; html: string; text: string; templateId?: string; triggerKey?: string; idempotencyKey?: string }) {
  const settings = await loadEmailWebhook();
  if (!settings) throw new Error("Configure an email webhook before sending.");
  const url = await validateWebhookUrl(settings.url);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}), ...(settings.secret ? { Authorization: `Bearer ${settings.secret}` } : {}) }, body: JSON.stringify({ event: "email.send", sentAt: new Date().toISOString(), email: payload }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Email webhook returned HTTP ${response.status}.`);
  return { status: response.status };
}
