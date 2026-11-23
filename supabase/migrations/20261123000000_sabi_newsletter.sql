create table if not exists public.sabi_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  status text not null default 'SUBSCRIBED' check (status in ('SUBSCRIBED','UNSUBSCRIBED','BOUNCED')),
  consent_at timestamptz not null default now(),
  source text not null default 'STORE',
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (unsubscribe_token)
);

create table if not exists public.sabi_newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject text not null,
  html_content text not null,
  text_content text,
  status text not null default 'DRAFT' check (status in ('DRAFT','QUEUED','SENDING','SENT','FAILED','CANCELLED')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sabi_newsletter_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.sabi_newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.sabi_newsletter_subscribers(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, subscriber_id)
);

create table if not exists public.sabi_newsletter_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month_start date not null,
  campaign_count integer not null default 0 check (campaign_count >= 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, month_start)
);

create index if not exists sabi_newsletter_subscribers_tenant_status_idx
  on public.sabi_newsletter_subscribers (tenant_id, status);
create index if not exists sabi_newsletter_queue_pending_idx
  on public.sabi_newsletter_queue (status, created_at)
  where status = 'PENDING';
create index if not exists sabi_newsletter_campaigns_tenant_created_idx
  on public.sabi_newsletter_campaigns (tenant_id, created_at desc);

alter table public.sabi_newsletter_subscribers enable row level security;
alter table public.sabi_newsletter_campaigns enable row level security;
alter table public.sabi_newsletter_queue enable row level security;
alter table public.sabi_newsletter_usage enable row level security;

revoke all on public.sabi_newsletter_subscribers from public, anon, authenticated;
revoke all on public.sabi_newsletter_campaigns from public, anon, authenticated;
revoke all on public.sabi_newsletter_queue from public, anon, authenticated;
revoke all on public.sabi_newsletter_usage from public, anon, authenticated;

grant select, insert, update, delete on public.sabi_newsletter_subscribers to service_role;
grant select, insert, update, delete on public.sabi_newsletter_campaigns to service_role;
grant select, insert, update, delete on public.sabi_newsletter_queue to service_role;
grant select, insert, update, delete on public.sabi_newsletter_usage to service_role;
