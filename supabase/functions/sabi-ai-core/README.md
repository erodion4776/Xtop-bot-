# Sabi AI Core (foundation)

This is an isolated first milestone for Sabi by XTOP. It is intentionally not wired into the existing WhatsApp webhook or merchant support chat.

## What this version does

- Requires a valid Supabase Auth access token.
- Resolves merchant access from active `tenant_members` rows.
- Validates a requested `tenant_id` against the signed-in user's active membership.
- Treats authenticated users without an active merchant membership as customers.
- Sends the message to the existing Cloudflare Workers AI model.
- Returns an explicit capability list showing that commerce operations are not enabled.

## What it does not do

- It does not read or write products, orders, payments, delivery, or stock.
- It does not create conversation history.
- It does not identify platform administrators yet; that must be connected to the existing verified admin authorization mechanism before admin tools are exposed.
- It does not receive WhatsApp webhooks and must not be exposed as a substitute for the signed webhook router.

## Required Edge Function secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- Optional: `SABI_AI_ALLOWED_ORIGIN` (defaults to the merchant app origin)

Do not put service-role or Cloudflare credentials in browser code.

## Test plan before any production connection

1. Deploy only to a non-production Supabase branch/project.
2. Call without a bearer token; expect HTTP 401.
3. Call with an invalid/expired token; expect HTTP 401.
4. Call with a valid customer token; expect role `customer`.
5. Call with a valid merchant token and its own tenant ID; expect role `merchant`.
6. Call with a different merchant's tenant ID; expect HTTP 403.
7. Confirm the response capability flags remain false for all commerce mutations and reads.

Do not connect this function to the live WhatsApp router or dashboard until the above tests pass and conversation persistence, admin authorization, and read-only commerce tools are implemented and reviewed.
