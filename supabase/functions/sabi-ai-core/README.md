# Sabi AI Core — Arena-powered foundation

Sabi AI Core is a new, isolated assistant endpoint for Sabi by XTOP. It uses Arena AI and Supabase Auth. It does **not** replace or modify the existing WhatsApp webhook, Sabi Support assistant, order, payment, or merchant workflows.

## Provider configuration

- Provider: Arena AI
- OpenAI-compatible endpoint: `https://api.arena.ai/v1/chat/completions`
- Model: `gpt-6-luna`
- Authentication: `Authorization: Bearer <ARENA_API_KEY>`
- Request format: Chat Completions with `model` and `messages`
- The request intentionally omits `temperature`, `max_tokens`, and other sampling controls, matching the known working Arena configuration.

The model can be overridden with the server-side `ARENA_MODEL` secret. No Groq or Cloudflare fallback is configured.

## What this version does

- Requires a valid Supabase Auth access token and validates it with Supabase Auth.
- Resolves a merchant role from active `tenant_members` membership.
- Verifies any supplied `tenant_id`; a tenant ID alone never grants access.
- Treats signed-in users without active merchant membership as customers.
- Requires a workspace selection when the caller has multiple active merchant memberships.
- Stores private conversations and messages, scoped to the authenticated user and current role/workspace.
- Supports `action: "message"` and `action: "history"`.
- Sends recent conversation context to Arena AI.
- Returns capability flags showing that live commerce operations are not enabled.

## What it does not do yet

- It does not identify platform administrators. Do not expose admin tools until the real existing platform-admin authorization mechanism is inspected and connected.
- It does not read or write products, orders, payments, delivery, stock, wallets, or account settings.
- It does not receive WhatsApp webhooks. Do not call it as a replacement for the signed WhatsApp webhook router.
- It does not change the existing `sabi-support` assistant.

## Database migration

Apply `supabase/migrations/20261128000000_sabi_ai_conversations.sql` to the Sabi by XTOP Supabase project before deploying the function. The tables are separate from the existing WhatsApp `conversations` and `messages` tables.

RLS is enabled. Authenticated users can read only their own AI conversations and messages. Writes are performed by the Edge Function after it validates the user's Supabase session and conversation ownership.

## Edge Function secrets

Required:
- `ARENA_API_KEY` — the existing Arena key stored in Supabase Secrets (never put it in frontend code or GitHub).
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `ARENA_MODEL` — defaults to `gpt-6-luna`.
- `SABI_AI_ALLOWED_ORIGINS` — comma-separated exact origins. Defaults to the main site, merchant app, and Discover domains.

The API key already created for the Dr. Irowa Arena setup is named `Irows`; do not regenerate it just for this integration. Store its value in the Supabase secret named `ARENA_API_KEY`. Do not paste the secret into chat or commit it.

## API examples

Send a message:

```json
{
  "action": "message",
  "message": "How do I add a product?"
}
```

Continue a conversation:

```json
{
  "action": "message",
  "conversation_id": "CONVERSATION_UUID",
  "message": "Show me the next step."
}
```

List recent conversations:

```json
{
  "action": "history"
}
```

Load one conversation:

```json
{
  "action": "history",
  "conversation_id": "CONVERSATION_UUID"
}
```

For merchant requests, pass the selected `tenant_id` on each call. The server verifies the caller's active membership every time.

## Test plan before production connection

1. Apply the migration to a development project/branch.
2. Deploy the function to a non-production Supabase environment and set `ARENA_API_KEY`.
3. Call without a bearer token; expect HTTP 401.
4. Call with an invalid/expired token; expect HTTP 401.
5. Call with a valid customer token; expect role `customer`, an assistant reply, and a saved conversation.
6. Call with a valid merchant token and its own tenant ID; expect role `merchant`.
7. Call with a different merchant's tenant ID; expect HTTP 403.
8. Try loading another user's conversation ID; expect HTTP 404.
9. Confirm the existing WhatsApp webhook and Sabi Support continue to work unchanged.

Do not connect this endpoint to the live WhatsApp router or production UI until the migration and tests pass. Admin authorization and read-only commerce tools are separate next milestones.
