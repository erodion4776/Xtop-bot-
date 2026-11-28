-- Sabi AI Core conversation history.
-- Separate from the existing WhatsApp conversations/messages tables.

create table if not exists public.sabi_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  role text not null check (role in ('customer', 'merchant')),
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sabi_ai_conversations_user_updated_idx
  on public.sabi_ai_conversations (user_id, updated_at desc);

create index if not exists sabi_ai_conversations_tenant_idx
  on public.sabi_ai_conversations (tenant_id)
  where tenant_id is not null;

create table if not exists public.sabi_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sabi_ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists sabi_ai_messages_conversation_created_idx
  on public.sabi_ai_messages (conversation_id, created_at asc);

alter table public.sabi_ai_conversations enable row level security;
alter table public.sabi_ai_messages enable row level security;

drop policy if exists "Users can read their own Sabi AI conversations" on public.sabi_ai_conversations;
create policy "Users can read their own Sabi AI conversations"
  on public.sabi_ai_conversations for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their own Sabi AI messages" on public.sabi_ai_messages;
create policy "Users can read their own Sabi AI messages"
  on public.sabi_ai_messages for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.sabi_ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

revoke all on public.sabi_ai_conversations from anon, authenticated;
revoke all on public.sabi_ai_messages from anon, authenticated;
grant select on public.sabi_ai_conversations to authenticated;
grant select on public.sabi_ai_messages to authenticated;
