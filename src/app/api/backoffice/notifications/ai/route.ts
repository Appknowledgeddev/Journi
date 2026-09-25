import { NextRequest, NextResponse } from "next/server";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";

type AIResponse = {
  error?: { message?: string };
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

function extractText(payload: AIResponse) {
  return payload.output_text?.trim() || payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join("\n").trim() || "";
}

export async function POST(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const body = (await request.json()) as {
    instruction?: string;
    title?: string;
    audience?: string;
    timing?: string;
    subject?: string;
    template?: string;
    mode?: "notification" | "global" | "content";
  };
  const instruction = body.instruction?.trim().slice(0, 2000);
  if (!instruction) return NextResponse.json({ error: "Describe how you want the template changed." }, { status: 400 });

  const isGlobal = body.mode === "global";
  const isContent = body.mode === "content";
  const input = [
    `You are Journi's expert lifecycle email designer. Create or improve a production-ready ${isGlobal ? "global email wrapper" : isContent ? "email content block" : "transactional email"}.`,
    `Return a concise subject and ${isContent ? "an HTML content fragment with no html, body, or outer table wrapper" : "a complete HTML email body using email-safe table layout and inline CSS only"}.`,
    isGlobal
      ? "The HTML must contain and preserve these placeholders exactly once where appropriate: {logo_url}, {email_subject}, {content}, {action_url}, {action_label}."
      : "Preserve relevant placeholders exactly: {first_name}, {participant_name}, {trip_title}, {action_url}.",
    "Do not add scripts, forms, tracking pixels, invented claims, or external images. Keep the tone warm, clear, and concise.",
    `Notification: ${body.title || "Untitled"}`,
    `Audience: ${body.audience || "Not specified"}`,
    `Timing: ${body.timing || "Not specified"}`,
    `Current subject: ${(body.subject || "").slice(0, 500)}`,
    `Current template:\n${(body.template || "").slice(0, 18000)}`,
    `Admin request: ${instruction}`,
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "email_template_revision",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                subject: { type: "string" },
                html: { type: "string" },
                summary: { type: "string" },
              },
              required: ["subject", "html", "summary"],
            },
          },
        },
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as AIResponse | null;
    if (!response.ok || !payload) return NextResponse.json({ error: payload?.error?.message || "Unable to improve the template right now." }, { status: response.status || 500 });
    const result = JSON.parse(extractText(payload)) as { subject?: string; html?: string; summary?: string };
    if (!result.subject || !result.html) return NextResponse.json({ error: "AI returned an incomplete template." }, { status: 502 });
    if (isGlobal && !["{logo_url}", "{email_subject}", "{content}", "{action_url}", "{action_label}"].every((placeholder) => result.html!.includes(placeholder))) {
      return NextResponse.json({ error: "AI did not preserve every required global placeholder. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ subject: result.subject, html: result.html, summary: result.summary || "Template updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to improve the template right now." }, { status: 500 });
  }
}
