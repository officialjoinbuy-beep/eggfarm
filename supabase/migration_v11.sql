-- ============================================================
-- v11 확장: 주문취소가 실제 배송/픽업 처리 흐름에서 완전히 제외되도록 보강,
--          위임 현황 요약 조회, 집계표 취소 제외는 API 라우트에서 처리
-- ============================================================

-- 취소된 주문은 일괄 배송중 처리 대상에서 제외
create or replace function public.bulk_set_shipping(p_order_ids uuid[])
returns void
language plpgsql
as $$
begin
  update public.orders
  set delivery_status = '배송중'
  where id = any(p_order_ids)
    and delivery_status = '배송준비'
    and cancelled_at is null;
end;
$$;

-- 취소된 주문은 배송상태 변경(배송중/배송완료/되돌리기)에서 제외
create or replace function public.set_delivery_status_safe(p_order_id uuid, p_from delivery_status, p_to delivery_status)
returns void
language plpgsql
as $$
begin
  update public.orders
  set delivery_status = p_to,
      delivery_completed_at = case when p_to = '배송완료' then now() else null end,
      delivery_photo_url = case when p_to <> '배송완료' then null else delivery_photo_url end
  where id = p_order_id and delivery_status = p_from and cancelled_at is null;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, p_from::text, p_to::text);
end;
$$;

-- 취소된 주문은 픽업상태 변경(수령완료/노쇼)에서 제외
create or replace function public.set_pickup_status(p_order_id uuid, p_to text)
returns void
language plpgsql
as $$
declare
  v_from text;
begin
  select pickup_status into v_from from public.orders where id = p_order_id;

  update public.orders
  set pickup_status = p_to,
      pickup_completed_at = case when p_to = '수령완료' then now() else pickup_completed_at end,
      on_site_paid = case
        when p_to = '수령완료' and payment_method = '현장결제' then true
        else on_site_paid
      end
  where id = p_order_id and pickup_status = '수령대기' and cancelled_at is null;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, coalesce(v_from, ''), p_to);
end;
$$;

-- 위임 현황 요약 (관리자 홈 배너용) - 마감된 지 2일 안 지난, 살아있는
-- (무효화 안됐고 만료 안된) 위임배송 링크를 공구/단지/담당자 정보와 함께 조회
create or replace function public.list_active_delegations(p_owner_id uuid)
returns table(
  link_id uuid,
  campaign_id uuid,
  campaign_title text,
  complex_ids uuid[],
  staff_id uuid,
  expires_at timestamptz
)
language sql
as $$
  select
    l.id, c.id, c.title, l.complex_ids, l.staff_id, l.expires_at
  from public.delivery_staff_links l
  join public.campaigns c on c.id = l.campaign_id
  where c.owner_id = p_owner_id
    and not l.revoked
    and l.expires_at > now()
  order by l.expires_at asc;
$$;
