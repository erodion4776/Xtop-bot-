create or replace function public.sabi_newsletter_create_campaign(
  p_tenant_id uuid,
  p_subject text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date := date_trunc('month', now())::date;
  v_usage public.sabi_newsletter_usage%rowtype;
  v_recipient_count integer;
  v_campaign_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id and user_id = v_user_id
      and role = 'OWNER' and is_active = true
  ) then raise exception 'You do not have access to this merchant workspace'; end if;
  if length(trim(coalesce(p_subject, ''))) < 3 or length(p_subject) > 120 then
    raise exception 'Subject must be between 3 and 120 characters';
  end if;
  if length(trim(coalesce(p_content, ''))) < 10 or length(p_content) > 12000 then
    raise exception 'Newsletter content must be between 10 and 12000 characters';
  end if;
  insert into public.sabi_newsletter_usage (tenant_id, month_start)
  values (p_tenant_id, v_month) on conflict (tenant_id, month_start) do nothing;
  select * into v_usage from public.sabi_newsletter_usage
  where tenant_id = p_tenant_id and month_start = v_month for update;
  if v_usage.campaign_count >= 2 then raise exception 'Monthly campaign limit reached (2 campaigns)'; end if;
  select count(*)::integer into v_recipient_count from (
    select id from public.sabi_newsletter_subscribers
    where tenant_id = p_tenant_id and status = 'SUBSCRIBED'
    order by created_at asc limit 501
  ) s;
  if v_recipient_count = 0 then raise exception 'There are no subscribed customers to receive this newsletter'; end if;
  if v_recipient_count > 500 then raise exception 'A campaign can have at most 500 recipients'; end if;
  if v_usage.recipient_count + v_recipient_count > 1000 then
    raise exception 'Monthly email allowance reached (1000 recipients)';
  end if;
  insert into public.sabi_newsletter_campaigns
    (tenant_id, subject, html_content, text_content, status, recipient_count, created_by, started_at)
  values (p_tenant_id, trim(p_subject),
    '<p>' || replace(replace(replace(trim(p_content), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
    trim(p_content), 'QUEUED', v_recipient_count, v_user_id, now())
  returning id into v_campaign_id;
  insert into public.sabi_newsletter_queue (tenant_id, campaign_id, subscriber_id)
  select p_tenant_id, v_campaign_id, id from public.sabi_newsletter_subscribers
  where tenant_id = p_tenant_id and status = 'SUBSCRIBED'
  order by created_at asc limit 500;
  update public.sabi_newsletter_usage
  set campaign_count = campaign_count + 1,
      recipient_count = recipient_count + v_recipient_count, updated_at = now()
  where tenant_id = p_tenant_id and month_start = v_month;
  return jsonb_build_object(
    'campaign_id', v_campaign_id, 'recipient_count', v_recipient_count,
    'campaigns_remaining', 1 - v_usage.campaign_count,
    'monthly_recipients_remaining', 1000 - v_usage.recipient_count - v_recipient_count
  );
end;
$$;
revoke all on function public.sabi_newsletter_create_campaign(uuid, text, text) from public, anon;
grant execute on function public.sabi_newsletter_create_campaign(uuid, text, text) to authenticated;

create or replace function public.sabi_newsletter_claim_batch(p_tenant_id uuid, p_campaign_id uuid, p_limit integer default 20)
returns table(id uuid, subscriber_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sabi_newsletter_queue q
  set status = 'PENDING', updated_at = now()
  where q.tenant_id = p_tenant_id and q.campaign_id = p_campaign_id
    and q.status = 'SENDING' and q.updated_at < now() - interval '10 minutes';
  return query
  with picked as (
    select q.id from public.sabi_newsletter_queue q
    join public.sabi_newsletter_subscribers s
      on s.id = q.subscriber_id and s.tenant_id = q.tenant_id
    where q.tenant_id = p_tenant_id and q.campaign_id = p_campaign_id
      and q.status = 'PENDING' and s.status = 'SUBSCRIBED'
    order by q.created_at for update of q skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  ),
  claimed as (
    update public.sabi_newsletter_queue q
    set status = 'SENDING', attempts = q.attempts + 1, updated_at = now()
    from picked where q.id = picked.id
    returning q.id, q.subscriber_id, q.attempts
  )
  select claimed.id, claimed.subscriber_id, claimed.attempts from claimed;
end;
$$;
revoke all on function public.sabi_newsletter_claim_batch(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.sabi_newsletter_claim_batch(uuid, uuid, integer) to service_role;
