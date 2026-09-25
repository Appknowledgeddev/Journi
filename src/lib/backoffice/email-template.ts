import { supabaseAdmin } from "@/lib/supabase/server";

export const defaultGlobalEmailTemplate = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#10203f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;padding:32px 16px;">
      <tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dce4ee;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:22px 32px;background:#10203f;"><img src="{logo_url}" width="132" alt="Journi" style="display:block;width:132px;max-width:100%;height:auto;border:0;" /></td></tr>
        <tr><td style="padding:36px 32px;">
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#10203f;">{email_subject}</h1>
          <div style="font-size:16px;line-height:1.65;color:#475569;">{content}</div>
          <a href="{action_url}" style="display:inline-block;margin-top:24px;padding:13px 22px;border-radius:8px;background:#2c94f5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">{action_label}</a>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">You are receiving this message because you are part of a trip on Journi.</td></tr>
      </table></td></tr>
    </table>
  </body>
</html>`;

export async function loadGlobalEmailTemplate() {
  const { data, error } = await supabaseAdmin.from("email_templates").select("id,name,html,updated_at").eq("id", "global").maybeSingle();
  if (error || !data) return { id: "global", name: "Global email template", html: defaultGlobalEmailTemplate, updatedAt: null, source: "default" as const };
  return { id: String(data.id), name: String(data.name), html: String(data.html), updatedAt: typeof data.updated_at === "string" ? data.updated_at : null, source: "database" as const };
}

export async function saveGlobalEmailTemplate(name: string, html: string) {
  const { data, error } = await supabaseAdmin.from("email_templates").upsert({ id: "global", name, html, updated_at: new Date().toISOString() }).select("id,name,html,updated_at").single();
  if (error) throw error;
  return { id: String(data.id), name: String(data.name), html: String(data.html), updatedAt: typeof data.updated_at === "string" ? data.updated_at : null, source: "database" as const };
}
