# XTOP Business Mail

A separate React + Vite staff mail client for XTOP Retail Technologies. It does not modify or reuse the Sabi merchant/admin login.

## Netlify site settings

Create a **new** Netlify site from `erodion4776/Xtop-bot-` (branch `main`) and set:

- Base directory: `business-mail`
- Build command: `npm run build`
- Publish directory: `dist`

Set these environment variables in the new Netlify site:

- `VITE_SUPABASE_URL` = `https://mldywarnnwjitfvqpgis.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = the project public anon/publishable key from Supabase API settings
- `VITE_MAIL_API_URL` = `https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-business-mail-api`

Do not put the Lockally API key or Supabase service-role/secret key in Netlify variables or frontend code. The Lockally key remains a Supabase Edge Function secret.

## Domain

After the new Netlify site has a successful deploy, add `mail.sabibyxtop.com.ng` as a custom domain to that new site. Configure Cloudflare only after checking the existing wildcard storefront Worker route so merchant subdomains remain unaffected.

## Initial staff access

Only the already-authorized Supabase Auth user `ero@sabibyxtop.com.ng` can access the current mailbox. New staff must be added to `public.xtop_mail_staff` and granted their own mailbox at Lockally before access is enabled.
