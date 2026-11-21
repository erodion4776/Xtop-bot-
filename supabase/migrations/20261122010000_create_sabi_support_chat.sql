create table if not exists public.sabi_support_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','waiting_human','resolved')),
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sabi_support_conversations_tenant_user_idx
  on public.sabi_support_conversations (tenant_id, user_id, status, last_message_at desc);
create table if not exists public.sabi_support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sabi_support_conversations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sender_role text not null check (sender_role in ('merchant','assistant','support')),
  content text not null check (char_length(content) between 1 and 6000),
  created_at timestamptz not null default now()
);
create index if not exists sabi_support_messages_conversation_idx
  on public.sabi_support_messages (conversation_id, created_at);
alter table public.sabi_support_conversations enable row level security;
alter table public.sabi_support_messages enable row level security;
revoke all on public.sabi_support_conversations from anon, authenticated;
revoke all on public.sabi_support_messages from anon, authenticated;
grant all on public.sabi_support_conversations to service_role;
grant all on public.sabi_support_messages to service_role;
