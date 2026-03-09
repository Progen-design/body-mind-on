# AI Runtime Integrations

This project exposes runtime integration availability to AI agents through `buildAgentContext()`.

## What agents now receive

Each agent context now includes `runtime_capabilities` with the current availability of:

- `database.supabase`
- `ai.openai`
- `enrichment.spoonacular`
- `enrichment.pexels`
- `enrichment.exercisedb`
- `delivery.email`
- `delivery.calendar`
- `delivery.cron`
- `billing.stripe`
- `app.public_url`

## Important runtime truth

The agents are instructed to use only integrations marked as enabled in `runtime_capabilities`.

Current limitation:

- OpenAI runtime uses the Responses API
- File Search / retrieval is **not** wired into runtime tool-calling
- Therefore prompts must not claim that documents were searched unless the relevant content was already passed into context

## Why this matters

This keeps agent behavior aligned with real infrastructure:

- no fake grounding
- no pretending an unavailable API was used
- no mismatch between DB prompts and actual runtime capabilities
