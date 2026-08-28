-- ============================================================
-- v10 확장: 수령방식(픽업/배송/하이브리드) + 배송비, 상품 추가/삭제/판매중지,
--          현장결제 결제완료 표시, 미수령 장기방치 보완, 워터마크는 코드단 수정,
--          주문취소/환불
-- ============================================================

-- ------------------------------------------------------------
-- 1. 공구 수령방식 + 문앞배송 배송비 (생성 시 한 번만 설정, 이후 수정 불가 - 앱단에서 강제)
-- ------------------------------------------------------------
alter table public.campaigns
  add column if not exists fulfillment_mode text not null default 'hybrid'
    check (fulfillment_mode in ('pickup_only', 'delivery_only', 'hybrid')),
  add column if not exists delivery_fee int not null default 0 check (delivery_fee >= 0);
-- 기존(v9 이전) 공구는 전부 위 default('hybrid', 0원)로 채워져 하이브리드로 간주됨

-- ------------------------------------------------------------
-- 2. 상품 판매중지 (추가/삭제는 API에서 주문이력 없는 상품만 허용, 여기선 플래그만)
-- ------------------------------------------------------------
alter table public.products
  add column if not exists is_active boolean not null default true;

-- ------------------------------------------------------------
-- 3. 문앞배송 배송비 관련 주문 컬럼 (같은 연락처 중복주문은 2번째부터 면제)
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_fee_charged int not null default 0,
  add column if not exists delivery_fee_waived boolean not null default false;

-- ------------------------------------------------------------
-- 4. 현장결제 "결제완료" 표시용 (수령완료 시 자동 true, 되돌리면 자동 false)
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists on_site_paid boolean not null default false;

-- ------------------------------------------------------------
-- 5. 주문취소(입금확인완료 이후) / 환불 상태 - 기존 payment_status enum은 건드리지
--    않고(운영중 enum에 새 값을 추가하면 같은 트랜잭션 내에서 바로 못 써 배포가 꼬이기
--    쉬움) 별도 컬럼으로 "취소 여부"를 얹는 방식으로 구현
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists refund_status text check (refund_status in ('환불대기', '환불완료'));

-- 배송준비 단계까지만(아직 배송중/배송완료 전, 픽업은 수령대기 상태까지만) 취소 가능.
-- 취소되면 재고를 반환해 다른 구매자가 바로 살 수 있게 한다.
create or replace function public.cancel_confirmed_order(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_order record;
  r record;
begin
  select payment_status, delivery_status, pickup_status, fulfillment_type, cancelled_at
    into v_order
    from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'ALREADY_CANCELLED';
  end if;
  if v_order.payment_status <> '입금확인완료' then
    raise exception 'NOT_CANCELLABLE';
  end if;
  if v_order.fulfillment_type = '배송' and v_order.delivery_status <> '배송준비' then
    raise exception 'ALREADY_SHIPPED';
  end if;
  if v_order.fulfillment_type = '픽업'
     and v_order.pickup_status is not null
     and v_order.pickup_status <> '수령대기' then
    raise exception 'ALREADY_PICKED_UP';
  end if;

  for r in
    select oi.product_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id
  loop
    perform public.release_stock(r.product_id, r.quantity);
  end loop;

  update public.orders
  set cancelled_at = now(),
      refund_status = case when payment_method = '계좌이체' then '환불대기' else null end,
      payment_deadline = null
  where id = p_order_id;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '입금확인완료', '주문취소(환불대기)');
end;
$$;

-- 진행자가 카톡 오픈채팅 등으로 실제 계좌이체 환불을 마친 뒤 기록만 남기는 용도
create or replace function public.mark_refund_completed(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.orders
  set refund_status = '환불완료'
  where id = p_order_id and refund_status = '환불대기';
end;
$$;

-- ------------------------------------------------------------
-- 6. 마감 후 미수령(수령대기) 장기 방치 보완
-- ------------------------------------------------------------
-- 공구 목록/달력에서 "마감 후 N일 지난 미수령 건" 뱃지 표시용
create or replace function public.list_stale_pending_pickups(p_owner_id uuid, p_days int default 7)
returns table(campaign_id uuid, stale_count bigint)
language sql
as $$
  select c.id, count(*)
  from public.campaigns c
  join public.orders o on o.campaign_id = c.id
  where c.owner_id = p_owner_id
    and c.is_closed = true
    and c.closed_at is not null
    and c.closed_at < now() - (p_days || ' days')::interval
    and o.fulfillment_type = '픽업'
    and o.pickup_status = '수령대기'
    and o.cancelled_at is null
  group by c.id;
$$;

-- 개인정보 자동폐기 확장: 마감 후 30일 넘도록 수령대기로 방치된 건도
-- 노쇼 처리 여부와 무관하게 개인정보만 익명화 (배송완료/수령완료 조건은 기존 그대로 유지)
create or replace function public.purge_expired_personal_data()
returns void
language plpgsql
as $$
begin
  update public.orders o
  set nickname = '[삭제됨]',
      phone = '[삭제됨]',
      address = '[삭제됨]',
      pin_hash = '[삭제됨]',
      complex_name = null,
      dong = null,
      unit_no = null,
      entry_password = null,
      pickup_signature = null
  from public.campaigns c
  where o.campaign_id = c.id
    and (
      (o.delivery_status = '배송완료' and o.delivery_completed_at < now() - (c.data_retention_days || ' days')::interval)
      or (o.pickup_status = '수령완료' and o.pickup_completed_at < now() - (c.data_retention_days || ' days')::interval)
      or (
        o.fulfillment_type = '픽업'
        and o.pickup_status = '수령대기'
        and c.closed_at is not null
        and c.closed_at < now() - interval '30 days'
      )
    )
    and o.nickname <> '[삭제됨]';
end;
$$;

-- ------------------------------------------------------------
-- 7. 픽업 수령완료 되돌리기 (지금까지 빠져있던 기능 - 현장결제 자동
--    결제완료 표시를 되돌리기와 맞물리게 하려면 반드시 필요)
-- ------------------------------------------------------------
create or replace function public.revert_pickup_complete(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.orders
  set pickup_status = '수령대기',
      pickup_completed_at = null,
      pickup_signature = null,
      on_site_paid = false
  where id = p_order_id and pickup_status = '수령완료';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '수령완료', '수령대기');
end;
$$;

-- 픽업 수령완료 처리 시(현장결제 건에 한해) 자동으로 결제완료 표시
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
  where id = p_order_id and pickup_status = '수령대기';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, coalesce(v_from, ''), p_to);
end;
$$;

-- ------------------------------------------------------------
-- 8. 문앞배송 주문 생성 시 수령방식 제한 + 배송비 계산(같은 연락처 중복주문 면제)
-- ------------------------------------------------------------
create or replace function public.create_order(
  p_campaign_id uuid,
  p_nickname text,
  p_phone text,
  p_pin_hash text,
  p_address text,
  p_items jsonb,
  p_payment_timeout_minutes int
)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_total int := 0;
  v_is_closed boolean;
  v_fulfillment_mode text;
  v_delivery_fee int;
  v_fee_charged int := 0;
  v_fee_waived boolean := false;
  v_has_prior_delivery boolean;
begin
  select is_closed, fulfillment_mode, delivery_fee
    into v_is_closed, v_fulfillment_mode, v_delivery_fee
    from public.campaigns where id = p_campaign_id for update;
  if v_is_closed is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_is_closed then
    raise exception 'CAMPAIGN_CLOSED';
  end if;
  if v_fulfillment_mode = 'pickup_only' then
    raise exception 'DELIVERY_NOT_AVAILABLE';
  end if;

  select exists (
    select 1 from public.orders
    where campaign_id = p_campaign_id
      and fulfillment_type = '배송'
      and phone = p_phone
      and cancelled_at is null
  ) into v_has_prior_delivery;

  if v_has_prior_delivery then
    v_fee_charged := 0;
    v_fee_waived := true;
  else
    v_fee_charged := coalesce(v_delivery_fee, 0);
    v_fee_waived := false;
  end if;

  v_order_id := gen_random_uuid();

  insert into public.orders (
    id, campaign_id, nickname, phone, pin_hash, address,
    total_amount, payment_deadline, consent_agreed,
    delivery_fee_charged, delivery_fee_waived
  ) values (
    v_order_id, p_campaign_id, p_nickname, p_phone, p_pin_hash, p_address,
    0, now() + (p_payment_timeout_minutes || ' minutes')::interval, true,
    v_fee_charged, v_fee_waived
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, price, stock_limit, stock_reserved, is_active
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid
      for update; -- 동시주문 시 행 잠금으로 경쟁상태 방지

    if v_product is null then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;
    if not v_product.is_active then
      raise exception 'PRODUCT_INACTIVE:%', v_product.id;
    end if;

    if v_product.stock_reserved + (v_item->>'quantity')::int > v_product.stock_limit then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    update public.products
      set stock_reserved = stock_reserved + (v_item->>'quantity')::int
      where id = v_product.id;

    insert into public.order_items (order_id, product_id, product_name_snapshot, quantity, unit_price)
    select v_order_id, v_product.id, p.name, (v_item->>'quantity')::int, v_product.price
    from public.products p where p.id = v_product.id;

    v_total := v_total + v_product.price * (v_item->>'quantity')::int;
  end loop;

  v_total := v_total + v_fee_charged;
  update public.orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

-- 현장픽업 주문 생성 시에도 수령방식 제한 + 상품 판매중지 체크 적용
create or replace function public.create_pickup_order(
  p_campaign_id uuid,
  p_nickname text,
  p_phone text,
  p_pin_hash text,
  p_payment_method text, -- '계좌이체' | '현장결제'
  p_items jsonb,
  p_payment_timeout_minutes int
)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_total int := 0;
  v_unit_price int;
  v_product_name text;
  v_is_active boolean;
  v_is_closed boolean;
  v_fulfillment_mode text;
begin
  select is_closed, fulfillment_mode into v_is_closed, v_fulfillment_mode
    from public.campaigns where id = p_campaign_id for update;
  if v_is_closed then
    raise exception 'CAMPAIGN_CLOSED';
  end if;
  if v_fulfillment_mode = 'delivery_only' then
    raise exception 'PICKUP_NOT_AVAILABLE';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select is_active into v_is_active from public.products where id = (v_item->>'product_id')::uuid;
    if v_is_active is null then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;
    if not v_is_active then
      raise exception 'PRODUCT_INACTIVE:%', (v_item->>'product_id');
    end if;
    perform public.reserve_stock(
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int
    );
  end loop;

  select sum((oi->>'quantity')::int * p.price), null into v_total, v_unit_price
  from jsonb_array_elements(p_items) oi
  join public.products p on p.id = (oi->>'product_id')::uuid;

  insert into public.orders (
    campaign_id, nickname, phone, pin_hash, address,
    fulfillment_type, payment_method, pickup_status, pickup_token,
    total_amount, payment_status, payment_deadline, consent_agreed
  ) values (
    p_campaign_id, p_nickname, p_phone, p_pin_hash, null,
    '픽업', p_payment_method,
    case when p_payment_method = '현장결제' then '수령대기' else null end,
    encode(gen_random_bytes(16), 'hex'),
    v_total,
    case when p_payment_method = '현장결제' then '입금확인완료' else '입금확인대기' end,
    case when p_payment_method = '현장결제' then null
         else now() + (p_payment_timeout_minutes || ' minutes')::interval end,
    true
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select price, name into v_unit_price, v_product_name
    from public.products where id = (v_item->>'product_id')::uuid;

    insert into public.order_items (order_id, product_id, product_name_snapshot, quantity, unit_price)
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_product_name,
      (v_item->>'quantity')::int,
      v_unit_price
    );
  end loop;

  return v_order_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. 공구 수정 시 상품 추가/삭제/판매중지 - 주문이력 없는 상품만 삭제 가능
-- ------------------------------------------------------------
create or replace function public.delete_product_if_unordered(p_product_id uuid)
returns void
language plpgsql
as $$
declare
  v_has_orders boolean;
begin
  select exists (
    select 1 from public.order_items where product_id = p_product_id
  ) into v_has_orders;

  if v_has_orders then
    raise exception 'PRODUCT_HAS_ORDERS';
  end if;

  delete from public.products where id = p_product_id;
end;
$$;

