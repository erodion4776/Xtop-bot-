# Sabi by XTOP

A WhatsApp commerce and merchant-management platform built around the WhatsApp Cloud API, Supabase Edge Functions, and PostgreSQL.

Sabi is being developed by **XTOP Retail Technologies** to help merchants manage product catalogues, customer conversations, orders, and payment workflows through WhatsApp and a web dashboard.

> **Project status:** Active development. Some workflows and integrations may still be under development; review the code and deployment configuration before treating any feature as production-ready.

## Product areas

- **WhatsApp experience** — webhook-based message handling and customer interactions using the WhatsApp Cloud API.
- **Merchant dashboard** — a React/Vite interface for merchant operations.
- **Backend services** — Supabase Edge Functions for application APIs and integrations.
- **Data layer** — PostgreSQL through Supabase, with tenant-aware data design.
- **Commerce workflows** — product, order, wallet and payment-related modules.
- **Deployment** — GitHub-based source control and hosted frontend/backend services.

## Technology

- TypeScript and JavaScript
- React and Vite
- Supabase Edge Functions
- PostgreSQL and Supabase Auth
- WhatsApp Cloud API
- Paystack integration
- Netlify and GitHub Actions

## Repository layout

The repository contains the application frontend, Supabase configuration and Edge Functions, deployment configuration, and supporting integration code. See the folders in the repository for the current implementation.

## Local development

The backend functions use the Supabase/Deno runtime. Start by reviewing:

1. `.env.example` for the environment variable names.
2. `supabase/config.toml` for local Supabase function configuration.
3. `package.json` and the project deployment files for the current frontend workflow.

Never commit real API keys, access tokens, service-role keys, payment secrets, or customer data. Use local environment variables and your hosting provider's secret manager.

## Architecture notes

WhatsApp webhooks and public callback endpoints must be configured with the correct provider verification and signature checks. Privileged Supabase operations must remain server-side, and merchant data access must be tenant-scoped and protected by Row Level Security.

## Maintainer

**Ero Osarodion Odion** — [@erodion4776](https://github.com/erodion4776)

Built as part of the XTOP Retail Technologies product portfolio.
