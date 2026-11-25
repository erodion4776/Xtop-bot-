# Sabi merchant subdomains

This deployment adds merchant storefront addresses such as:

- https://oxlounge.sabibyxtop.com.ng/
- https://oxlounge.sabibyxtop.com.ng/?product=PRODUCT_ID

## How it works

The existing React storefront resolves the merchant from the first-level hostname and loads the existing public storefront RPC using the merchant's current `business_slug`. No second product catalogue or merchant database is created.

The Cloudflare Worker proxies requests for subdomains under `sabibyxtop.com.ng` to the existing Netlify site `xtopbot.netlify.app`. The browser retains the requested hostname, allowing the app to distinguish merchant stores from the existing app, Discover and admin hosts.

## Before enabling

1. Confirm `xtopbot.netlify.app` is still the production Netlify deploy target for the Sabi app.
2. In Cloudflare DNS, create a wildcard record:
   - Type: CNAME
   - Name: `*`
   - Target: `xtopbot.netlify.app`
   - Proxy status: Proxied (orange cloud)
3. Deploy this Worker from the repository root using Wrangler:
   `npx wrangler deploy`
4. Confirm the Worker route is `*.sabibyxtop.com.ng/*`.
5. Test a real merchant slug, for example `oxlounge.sabibyxtop.com.ng`, plus the existing `app`, `discover`, and `admin` hosts.

Do not add the wildcard DNS record or enable the route until you are ready to activate the Worker. The route covers existing first-level subdomains too; the Worker deliberately proxies those to the same Netlify app so the current hostname-based app routing remains intact.

## Important

- Keep existing explicit DNS records for named hosts. Cloudflare's more-specific records take precedence over the wildcard.
- Do not proxy mail-related records or change MX, SPF, DKIM or DMARC records.
- The apex `sabibyxtop.com.ng` is not covered by this wildcard route.
- The app uses existing merchant slugs; a merchant must already have a published Sabi Discover storefront.
- Cloudflare edge SSL must be active for the zone before customer testing.
