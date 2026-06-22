const http = require("http");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1];
const model = env.match(/^OPENAI_MODEL=(.+)$/m)?.[1] || "gpt-4.1-mini";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY missing");
}

const audienceLabels = {
  adults_only: "Adults Only",
  family_friendly: "Family Friendly",
  couples: "Couples",
  luxury: "Luxury",
  adventure: "Adventure",
  wellness: "Wellness",
  seniors: "Seniors",
  accessible: "Accessible",
  pet_friendly: "Pet-Friendly",
};

const groupLabels = {
  "4-6": "4-6 people",
  "6-10": "6-10 people",
  "10+": "10+ people",
};

const budgetLabels = {
  "200-400": "£200-£400",
  "400-650": "£400-£650",
  "650+": "£650+",
};

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function extractText(payload) {
  return (
    payload.output_text?.trim() ||
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text) => Boolean(text?.trim()))
      .join("\n")
      .trim() ||
    ""
  );
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (req.method !== "POST" || req.url !== "/api/trip-organiser/generate-description") {
    return send(res, 404, { error: "Not found" });
  }

  try {
    const body = await readBody(req);
    const destination = body.destination?.trim() || "";
    const tripType = body.tripType?.trim() || "group trip";
    const audienceLabel = audienceLabels[body.audience] || "Open to all";
    const groupSizeLabel = groupLabels[body.groupSize] || "Group size to confirm";
    const dateSummary =
      body.dateMode === "flexible"
        ? "Dates are still flexible and will be confirmed later."
        : body.startsAt && body.endsAt
          ? `Current working dates are ${body.startsAt} to ${body.endsAt}.`
          : "Dates have not been confirmed yet.";
    const budgetSummary =
      body.budgetMode === "overall" && body.totalBudget?.trim()
        ? `The organiser is currently thinking about an overall budget of £${body.totalBudget.trim()}.`
        : `The current per-person budget band is ${budgetLabels[body.budgetBand] || "Budget to confirm"}.`;

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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: prompt }),
    });
    const payload = await response.json();

    if (!response.ok) {
      return send(res, 400, {
        error: payload.error?.message || "Unable to generate a trip description right now.",
      });
    }

    const outputText = extractText(payload);

    if (!outputText) {
      return send(res, 502, {
        error: "OpenAI returned an empty description. Please try again.",
      });
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

    return send(res, 200, { title, description });
  } catch (error) {
    return send(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Unable to generate a trip description right now.",
    });
  }
});

const port = Number(process.env.AI_HELPER_PORT || 3003);

server.listen(port, "127.0.0.1", () => {
  console.log(`AI helper ready on http://127.0.0.1:${port}`);
});
