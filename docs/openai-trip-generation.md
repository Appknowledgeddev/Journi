# OpenAI Trip Description Setup

Journi can generate draft trip descriptions inside the organiser flow with the OpenAI API.

## Environment variables

Add these to local development and to Vercel:

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. If omitted, Journi uses `gpt-4.1-mini`.

## What the integration does

- Generates a short organiser-ready trip description
- Suggests a sharper trip title if the organiser has not written one yet
- Uses the current destination, trip type, audience, budget, and group size context

## Billing and ownership

Right now the integration assumes one shared OpenAI key owned by the Journi environment.

Later, if organisers should manage their own AI usage directly, the recommended path is:

1. Give each organiser a settings screen for their own OpenAI API key
2. Encrypt and store that key server-side
3. Route generation calls through the organiser’s saved key
4. Show clear usage and billing copy before the feature is enabled

## Important note

Codex can wire the integration and document it, but it cannot create or fund an OpenAI account for you. You will still need to create the account and add the API key in your local/Vercel environment yourself.
