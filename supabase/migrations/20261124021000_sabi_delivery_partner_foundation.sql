
create table if not exists public.sabi_delivery_partners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  provider_type text not null default 'API' check (provider_type in ('API','MANUAL')),
  integration_status text not null default 'NOT_CONNECTED' check (integration_status in ('NOT_CONNECTED','TESTING','ACTIVE','PAUSED')),
  is_enabled boolean not null default false,
  service_states text[] not null default '{}',
  service_cities text[] not null default '{}',
  supports_cod boolean not null default false,
  tracking_url_template text,
  public_description text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tenant_delivery_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  delivery_mode text not null default 'MERCHANT' check (delivery_mode in ('MERCHANT','PARTNER')),
  preferred_partner_id uuid references public.sabi_delivery_partners(id) on delete set null,
  pickup_address text,
  pickup_state text,
  pickup_city text,
  pickup_lga text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tenant_delivery_partner_mode_check check (
    (delivery_mode = 'MERCHANT' and preferred_partner_id is null)
    or (delivery_mode = 'PARTNER')
  )
);
create table if not exists public.sabi_delivery_shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.tenant_orders(id) on delete cascade,
  partner_id uuid references public.sabi_delivery_partners(id) on delete set null,
  provider_shipment_id text,
  tracking_number text,
  tracking_url text,
  status text not null default 'PENDING' check (status in ('PENDING','QUOTED','BOOKING','BOOKED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED')),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  currency text not null default 'NGN',
  quote_expires_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_id)
);
create index if not exists sabi_delivery_partners_enabled_idx on public.sabi_delivery_partners(is_enabled, sort_order);
create index if not exists sabi_delivery_shipments_tenant_status_idx on public.sabi_delivery_shipments(tenant_id, status, created_at desc);
alter table public.sabi_delivery_partners enable row level security;
alter table public.tenant_delivery_preferences enable row level security;
alter table public.sabi_delivery_shipments enable row level security;
revoke all on public.sabi_delivery_partners from anon, authenticated;
revoke all on public.tenant_delivery_preferences from anon, authenticated;
revoke all on public.sabi_delivery_shipments from anon, authenticated;
grant all on public.sabi_delivery_partners to service_role;
grant all on public.tenant_delivery_preferences to service_role;
grant all on public.sabi_delivery_shipments to service_role;

insert into public.sabi_delivery_partners
  (code, name, provider_type, integration_status, is_enabled, public_description, sort_order)
values
  ('SENDBOX', 'Sendbox', 'API', 'TESTING', false,
   'Sabi-approved delivery network. Integration is being tested; live merchant booking is not yet enabled.',
   10)
on conflict (code) do nothing;
