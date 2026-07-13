import { NextRequest, NextResponse } from "next/server";
import {
  getAudienceLabel,
  getBudgetBandLabel,
  getGroupSizeLabel,
} from "@/lib/trip-organiser/config";

type GenerateDescriptionPayload = {
  destination?: string;
  tripType?: string;
  audience?: string;
  dateMode?: string;
  startsAt?: string;
  endsAt?: string;
  groupSize?: string;
  budgetMode?: string;
  budgetBand?: string;
  totalBudget?: string;
};

type OpenAIResponsesPayload = {
  error?: { message?: string };
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

function extractResponseText(payload: OpenAIResponsesPayload) {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim();

  return outputText || "";
}

function isRetryableOpenAIError(status: number, message: string) {
  return status >= 500 || message.toLowerCase().includes("processing your request");
}

async function waitForRetry() {
  await new Promise((resolve) => setTimeout(resolve, 700));
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured yet. Add it to your environment before using AI trip descriptions.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json()) as GenerateDescriptionPayload;
  const destination = body.destination?.trim() || "";
  const tripType = body.tripType?.trim() || "group trip";
  const audienceLabel = getAudienceLabel(body.audience);
  const groupSizeLabel = getGroupSizeLabel(body.groupSize);
  const dateSummary =
    body.dateMode === "flexible"
      ? "Dates are still flexible and will be confirmed later."
      : body.startsAt && body.endsAt
        ? `Current working dates are ${body.startsAt} to ${body.endsAt}.`
        : "Dates have not been confirmed yet.";
  const budgetSummary =
    body.budgetMode === "overall" && body.totalBudget?.trim()
      ? `The organiser is currently thinking about an overall budget of £${body.totalBudget.trim()}.`
      : `The current per-person budget band is ${getBudgetBandLabel(body.budgetBand)}.`;

  const prompt = [
    "Write a polished but concise trip description for a shared group trip planning app called Journi.",
    "Use a warm organiser-friendly tone.",
    "Keep it between 55 and 95 words.",
    "Also suggest one short trip title on a separate line beginning with TITLE:",
    `Destination: ${destination || "Undecided"}`,
    `Trip type: ${tripType}`,
    `Audience: ${audienceLabel}`,
    `Group size: ${groupSizeLabel}`,
    dateSummary,
    budgetSummary,
  ].join("\n");

  try {
    let payload: OpenAIResponsesPayload | null = null;
    let openAIStatus = 500;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: prompt,
        }),
        cache: "no-store",
      });

      payload = (await response.json().catch(() => null)) as OpenAIResponsesPayload | null;
      openAIStatus = response.status;

      if (response.ok) {
        break;
      }

      const errorMessage = payload?.error?.message || "";
      const shouldRetry = attempt === 0 && isRetryableOpenAIError(response.status, errorMessage);

      if (!shouldRetry) {
        return NextResponse.json(
          { error: errorMessage || "Unable to generate a trip description right now." },
          { status: 400 },
        );
      }

      await waitForRetry();
    }

    if (!payload) {
      return NextResponse.json(
        { error: "Unable to generate a trip description right now." },
        { status: openAIStatus },
      );
    }

    const outputText = extractResponseText(payload);

    if (!outputText) {
      return NextResponse.json(
        { error: "OpenAI returned an empty description. Please try again." },
        { status: 502 },
      );
    }

    const lines = outputText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const titleLine = lines.find((line) => line.toUpperCase().startsWith("TITLE:"));
    const title = titleLine?.replace(/^TITLE:\s*/i, "").trim() || "";
    const description = lines
      .filter((line) => !line.toUpperCase().startsWith("TITLE:"))
      .join(" ")
      .trim();

    return NextResponse.json({
      title,
      description,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to generate a trip description right now.",
      },
      { status: 500 },
    );
  }
}
