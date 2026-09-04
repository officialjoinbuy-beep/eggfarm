-- ============================================================
-- v33: 픽업 "수령완료" 처리 시 500 에러("처리 중 오류가 발생했습니다") 수정
--      원인: v30에서 delivery_revenue_log에 매출 기록을 추가했는데,
--      함수가 SECURITY DEFINER 없이(일반 로그인 권한으로) 실행되다 보니
--      RLS(입력 권한 정책 없음)에 막혀 매번 조용히 실패하고 있었음.
--      set_pickup_status와, 같은 구조를 쓰는 set_delivery_status_safe
--      둘 다 SECURITY DEFINER로 재정의해 이 문제를 근본적으로 막는다.
-- ============================================================

create or replace function public.set_pickup_status(p_order_id uuid, p_to text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_owner_id uuid;
  v_campaign_id uuid;
  v_campaign_title text;
  v_amount int;
begin
  select pickup_status into v_from from public.orders where id = p_order_id;

  update public.orders
  set pickup_status = p_to,
      pickup_completed_at = case when p_to = '수령완료' then now() else pickup_completed_at end,
      on_site_paid = case
        when p_to = '수령완료' and payment_method = '현장결제' then true
        else on_site_paid
      end
  where id = p_order_id and pickup_status = '수령대기';

  if p_to = '수령완료' then
    select o.campaign_id, o.total_amount, c.owner_id, c.title
      into v_campaign_id, v_amount, v_owner_id, v_campaign_title
      from public.orders o join public.campaigns c on c.id = o.campaign_id
      where o.id = p_order_id;

    insert into public.delivery_revenue_log (order_id, owner_id, campaign_id, campaign_title, amount, completed_at)
    values (p_order_id, v_owner_id, v_campaign_id, v_campaign_title, v_amount, now())
    on conflict (order_id) do update
      set amount = excluded.amount, completed_at = excluded.completed_at;
  end if;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, coalesce(v_from, ''), p_to);
end;
$$;

create or replace function public.set_delivery_status_safe(p_order_id uuid, p_from delivery_status, p_to delivery_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_campaign_id uuid;
  v_campaign_title text;
  v_amount int;
begin
  update public.orders
  set delivery_status = p_to,
      delivery_completed_at = case when p_to = '배송완료' then now() else null end,
      delivery_photo_url = case when p_to <> '배송완료' then null else delivery_photo_url end
  where id = p_order_id and delivery_status = p_from;

  if p_to = '배송완료' then
    select o.campaign_id, o.total_amount, c.owner_id, c.title
      into v_campaign_id, v_amount, v_owner_id, v_campaign_title
      from public.orders o join public.campaigns c on c.id = o.campaign_id
      where o.id = p_order_id;

    insert into public.delivery_revenue_log (order_id, owner_id, campaign_id, campaign_title, amount, completed_at)
    values (p_order_id, v_owner_id, v_campaign_id, v_campaign_title, v_amount, now())
    on conflict (order_id) do update
      set amount = excluded.amount, completed_at = excluded.completed_at;
  elsif p_from = '배송완료' then
    delete from public.delivery_revenue_log where order_id = p_order_id;
  end if;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, p_from::text, p_to::text);
end;
$$;

create or replace function public.revert_pickup_complete(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set pickup_status = '수령대기',
      pickup_completed_at = null,
      pickup_signature = null,
      on_site_paid = false
  where id = p_order_id and pickup_status = '수령완료';

  delete from public.delivery_revenue_log where order_id = p_order_id;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '수령완료', '수령대기');
end;
$$;
