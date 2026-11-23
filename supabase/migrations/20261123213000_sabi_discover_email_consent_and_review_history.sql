-- Keep Sabi Discover opt-in synchronized with the platform email campaign audience.
create or replace function public.sabi_save_discover_customer_profile(p_full_name text,p_phone text default null,p_email_marketing_consent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_name text;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select lower(email) into v_email from auth.users where id=v_uid;
  if v_email is null then raise exception 'Your account email could not be verified'; end if;
  v_name := left(trim(coalesce(p_full_name,'')),120);
  insert into public.sabi_discover_customer_profiles(user_id,full_name,phone,email_marketing_consent,email_consent_at,email_consent_source,updated_at)
  values(v_uid,v_name,nullif(trim(coalesce(p_phone,'')),''),coalesce(p_email_marketing_consent,false),
    case when coalesce(p_email_marketing_consent,false) then now() else null end,
    case when coalesce(p_email_marketing_consent,false) then 'discover_account_signup' else null end,now())
  on conflict(user_id) do update set full_name=excluded.full_name,phone=excluded.phone,
    email_marketing_consent=excluded.email_marketing_consent,
    email_consent_at=case when excluded.email_marketing_consent and not public.sabi_discover_customer_profiles.email_marketing_consent then now()
      when not excluded.email_marketing_consent then null else public.sabi_discover_customer_profiles.email_consent_at end,
    email_consent_source=case when excluded.email_marketing_consent then 'discover_account_settings' else null end,updated_at=now();
  if coalesce(p_email_marketing_consent,false) then
    insert into public.sabi_platform_email_subscribers(email,full_name,status,consent_at,consent_source,created_at,updated_at)
    values(v_email,v_name,'SUBSCRIBED',now(),'sabi_discover_customer_signup',now(),now())
    on conflict(email) do update set full_name=excluded.full_name,status='SUBSCRIBED',
      consent_at=now(),consent_source='sabi_discover_customer_preferences',updated_at=now();
  else
    update public.sabi_platform_email_subscribers set status='UNSUBSCRIBED',updated_at=now()
    where email=v_email and status='SUBSCRIBED';
  end if;
end; $$;
revoke all on function public.sabi_save_discover_customer_profile(text,text,boolean) from public,anon;
grant execute on function public.sabi_save_discover_customer_profile(text,text,boolean) to authenticated;

create or replace function public.sabi_get_my_reviewable_orders()
returns table(order_id uuid,order_number text,business_name text,ordered_at timestamptz,rating smallint,review_text text)
language sql stable security definer set search_path = '' as $$
  select o.id,o.order_number,coalesce(t.business_name,t.name),o.created_at,r.rating,r.review_text
  from public.tenant_orders o
  join public.contacts c on c.id=o.contact_id
  join public.tenants t on t.id=o.tenant_id
  join auth.users u on u.id=auth.uid()
  left join public.sabi_seller_reviews r on r.order_id=o.id and r.customer_user_id=auth.uid()
  where o.payment_status='PAID' and o.status='COMPLETED'
    and lower(coalesce(c.email,''))=lower(coalesce(u.email,''))
  order by o.created_at desc limit 50;
$$;
revoke all on function public.sabi_get_my_reviewable_orders() from public,anon;
grant execute on function public.sabi_get_my_reviewable_orders() to authenticated;