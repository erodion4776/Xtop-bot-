# ENGR ERO web portal release

## Before merging

Apply these SQL files in Supabase SQL Editor, in filename order:

1. `supabase/migrations/20261117120000_add_engr_ero_secure_portal_sessions.sql`
2. `supabase/migrations/20261117123000_bind_engr_ero_cbt_to_payment.sql`
3. `supabase/migrations/20261117130000_link_engr_ero_portal_to_whatsapp_conversation.sql`

Run each file once and confirm it succeeds before merging the pull request. The production deployment workflow deploys Edge Functions but does not apply database migrations.

After the migrations are applied and the pull request is merged, the production workflow deploys `whatsapp-webhook` and `engr-ero-portal`. Netlify publishes the new static page from the main branch.

## Enable background CBT auto-submit

The exam page submits immediately when its countdown reaches zero. This scheduled job is the backup for cases where a student closes the browser before the timer ends. It checks every five minutes and finalizes any expired, unanswered or partially answered portal attempt. The original server deadline is never extended.

Create one strong random secret and add the **same value** in both places:

1. Supabase Dashboard → Project Settings → Edge Functions → Secrets:
   - Name: `ENGR_ERO_CRON_SECRET`
   - Value: your generated secret
2. GitHub repository → Settings → Secrets and variables → Actions → New repository secret:
   - Name: `ENGR_ERO_CRON_SECRET`
   - Value: exactly the same secret

The scheduled GitHub Action calls the portal function using that secret. If it is not configured, the page timer still submits while open, but the background sweep is skipped.

## Smoke-test checklist

- A registered student receives a lesson link in WhatsApp.
- The OTP is delivered to the student's registered WhatsApp number.
- The same browser/device can open the current lesson; another browser cannot reuse its session.
- Completing a lesson opens the next lesson and the server refuses out-of-order lesson IDs.
- CBT is blocked until all published lessons are completed.
- CBT payment is still initiated and verified in WhatsApp/Paystack.
- One successful payment creates one CBT session; a reused payment reference cannot create another attempt.
- The exam starts only after the student taps Start, lasts 30 minutes, saves each answer, and does not reveal correct answers to the browser.
- Refreshing or resuming does not reset the deadline.
- Expired attempts are finalized by the browser timer or by the five-minute scheduled sweep.
- The final score is saved and sent to the registered WhatsApp number.
