-- Sabi multi-merchant marketplace checkout foundation.
-- Additive only: existing single-merchant and WhatsApp order/payment flows remain unchanged.

create table if not exists public.sabi_marketplace_checkouts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  delivery_address text not null,
  notes text,
  currency text not null default 'NGN',
  status text not null default 'PENDING'
    check (status in ('PENDING','PAID','FAILED','CANCELLED','EXPIRED')),
  payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID','PAID','FAILED','REFUNDED')),
  item_subtotal numeric(14,2) not null default 0 check (item_subtotal >= 0),
  delivery_total numeric(14,2) not null default 0 check (delivery_total >= 0),
  commission_total numeric(14,2) not null default 0 check (commission_total >= 0),
  customer_service_fee numeric(14,2) not null default 0 check (customer_service_fee >= 0),
  paystack_processing_fee numeric(14,2) not null default 0 check (paystack_processing_fee >= 0),
  expected_amount numeric(14,2) not null default 0 check (expected_amount >= 0),
  paystack_transaction_id text unique,
  paystack_status text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sabi_marketplace_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.sabi_marketplace_checkouts(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  order_id uuid not null references public.tenant_orders(id) on delete restrict,
  merchant_name text not null,
  subaccount_code text not null,
  item_subtotal numeric(14,2) not null check (item_subtotal >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  merchant_payout_amount numeric(14,2) not null check (merchant_payout_amount >= 0),
  created_at timestamptz not null default now(),
  unique (checkout_id, tenant_id),
  unique (order_id)
);

create index if not exists idx_sabi_marketplace_checkouts_customer
  on public.sabi_marketplace_checkouts (customer_email, created_at desc);
create index if not exists idx_sabi_marketplace_checkout_orders_checkout
  on public.sabi_marketplace_checkout_orders (checkout_id);
create index if not exists idx_sabi_marketplace_checkout_orders_tenant
  on public.sabi_marketplace_checkout_orders (tenant_id, created_at desc);

-- One Paystack transaction can allocate settlement to multiple merchant subaccounts.
-- Keep an immutable per-merchant allocation ledger instead of violating the existing
-- single-order/single-transaction uniqueness rules in sabi_order_paystack_charges.
create table if not exists public.sabi_marketplace_paystack_allocations (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.sabi_marketplace_checkouts(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  order_id uuid not null references public.tenant_orders(id) on delete restrict,
  payment_reference text not null,
  paystack_transaction_id text not null,
  commission_basis_amount numeric(14,2) not null check (commission_basis_amount >= 0),
  merchant_commission_amount numeric(14,2) not null check (merchant_commission_amount >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  merchant_payout_amount numeric(14,2) not null check (merchant_payout_amount >= 0),
  currency text not null default 'NGN',
  settlement_status text not null default 'PENDING',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (checkout_id, tenant_id),
  unique (order_id)
);

create index if not exists idx_sabi_marketplace_allocations_transaction
  on public.sabi_marketplace_paystack_allocations (paystack_transaction_id);

alter table public.sabi_marketplace_checkouts enable row level security;
alter table public.sabi_marketplace_checkout_orders enable row level security;
alter table public.sabi_marketplace_paystack_allocations enable row level security;

drop policy if exists "Service role manages marketplace checkouts" on public.sabi_marketplace_checkouts;
create policy "Service role manages marketplace checkouts"
  on public.sabi_marketplace_checkouts for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages marketplace checkout orders" on public.sabi_marketplace_checkout_orders;
create policy "Service role manages marketplace checkout orders"
  on public.sabi_marketplace_checkout_orders for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages marketplace allocations" on public.sabi_marketplace_paystack_allocations;
create policy "Service role manages marketplace allocations"
  on public.sabi_marketplace_paystack_allocations for all to service_role
  using (true) with check (true);

grant all on public.sabi_marketplace_checkouts to service_role;
grant all on public.sabi_marketplace_checkout_orders to service_role;
grant all on public.sabi_marketplace_paystack_allocations to service_role;
