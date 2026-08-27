-- ============================================================
-- 공동구매 주문취합 플랫폼 - DB 스키마 (Supabase / Postgres)
-- ============================================================

-- 확장기능
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 공구(campaigns) 테이블
-- ------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  inquiry_url text, -- 오픈채팅 1:1 문의 링크
  payment_timeout_minutes int not null default 120, -- 입금확인 대기 시간(분)
  data_retention_days int not null default 15, -- 배송완료 후 개인정보 보유기간
  is_closed boolean not null default false,
  closed_at timestamptz,
  close_deadline timestamptz, -- 마감 예정일시(선택) - 지나면 자동 마감
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

-- 진행자 본인 공구만 조회/수정 가능
create policy "owner_select_campaigns" on public.campaigns
  for select using (auth.uid() = owner_id);
create policy "owner_insert_campaigns" on public.campaigns
  for insert with check (auth.uid() = owner_id);
create policy "owner_update_campaigns" on public.campaigns
  for update using (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- 2. 상품(products) 테이블 - 공구당 최대 3개
-- ------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  price int not null check (price >= 0),
  stock_limit int not null check (stock_limit >= 0),
  stock_reserved int not null default 0 check (stock_reserved >= 0),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint stock_not_exceeded check (stock_reserved <= stock_limit)
);

alter table public.products enable row level security;

-- 상품은 공구가 열려있는 동안 누구나 조회 가능(구매자 화면용)
create policy "public_select_products" on public.products
  for select using (true);

-- 등록/수정은 해당 공구의 소유자만
create policy "owner_insert_products" on public.products
  for insert with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "owner_update_products" on public.products
  for update using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 3. 주문(orders) 테이블
-- ------------------------------------------------------------
create type payment_status as enum ('입금확인대기', '입금확인완료', '주문취소(미입금)');
create type delivery_status as enum ('배송준비', '배송중', '배송완료');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  nickname text not null,
  phone text not null, -- 하이픈 없이 숫자만 저장
  pin_hash text not null, -- PIN 4자리는 해시로 저장(평문 저장 금지)
  address text not null,
  total_amount int not null,
  payment_status payment_status not null default '입금확인대기',
  delivery_status delivery_status not null default '배송준비',
  payment_deadline timestamptz, -- 접수시각 + payment_timeout_minutes (입금확인/되돌리기 시 null 가능)
  delivery_photo_url text,
  delivery_completed_at timestamptz,
  consent_agreed boolean not null default false, -- 개인정보 수집이용 동의
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- 구매자 조회/주문접수는 서버(API route, service_role)를 통해서만 처리.
-- 클라이언트에서 직접 orders 테이블에 접근하는 것은 막는다 (정책 없음 = 기본 차단).
-- 진행자는 본인 공구의 주문만 조회/수정 가능
create policy "owner_select_orders" on public.orders
  for select using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "owner_update_orders" on public.orders
  for update using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 4. 주문상품(order_items) 테이블 - 한 주문에 여러 상품 담기 가능
-- ------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null, -- 마감 후에도 집계표에 상품명 남기기 위한 스냅샷
  quantity int not null check (quantity > 0),
  unit_price int not null
);

alter table public.order_items enable row level security;
create policy "owner_select_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      join public.campaigns c on c.id = o.campaign_id
      where o.id = order_id and c.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5. 상태변경 로그(order_status_logs) - 되돌리기 근거 기록
-- ------------------------------------------------------------
create table public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  reverted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_status_logs enable row level security;
create policy "owner_select_status_logs" on public.order_status_logs
  for select using (
    exists (
      select 1 from public.orders o
      join public.campaigns c on c.id = o.campaign_id
      where o.id = order_id and c.owner_id = auth.uid()
    )
  );
create policy "owner_insert_status_logs" on public.order_status_logs
  for insert with check (
    exists (
      select 1 from public.orders o
      join public.campaigns c on c.id = o.campaign_id
      where o.id = order_id and c.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 원자적 재고 처리 함수 (동시주문 경쟁상태 방지)
-- ============================================================
-- 여러 명이 동시에 같은 상품을 주문해도, 이 함수는 DB 트랜잭션
-- 내에서 "재고 확인 + 예약(증가)"을 하나의 원자적 연산으로 처리한다.
-- 재고가 부족하면 예외를 던져 API 단에서 "품절되었습니다"로 응답한다.
create or replace function public.reserve_stock(p_product_id uuid, p_qty int)
returns void
language plpgsql
as $$
declare
  v_updated int;
begin
  update public.products
  set stock_reserved = stock_reserved + p_qty
  where id = p_product_id
    and stock_reserved + p_qty <= stock_limit
  returning 1 into v_updated;

  if v_updated is null then
    raise exception 'OUT_OF_STOCK';
  end if;
end;
$$;

-- 재고 복원(주문취소/자동취소/되돌리기 시)
create or replace function public.release_stock(p_product_id uuid, p_qty int)
returns void
language plpgsql
as $$
begin
  update public.products
  set stock_reserved = greatest(0, stock_reserved - p_qty)
  where id = p_product_id;
end;
$$;

-- ============================================================
-- 주문 생성 함수 (여러 상품 담기 + 재고차감 + 마감체크를 하나의 트랜잭션으로)
-- ============================================================
-- p_items 예시: '[{"product_id":"...","quantity":2},{"product_id":"...","quantity":1}]'::jsonb
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
begin
  select is_closed into v_is_closed from public.campaigns where id = p_campaign_id for update;
  if v_is_closed is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_is_closed then
    raise exception 'CAMPAIGN_CLOSED';
  end if;

  v_order_id := gen_random_uuid();

  insert into public.orders (
    id, campaign_id, nickname, phone, pin_hash, address,
    total_amount, payment_deadline, consent_agreed
  ) values (
    v_order_id, p_campaign_id, p_nickname, p_phone, p_pin_hash, p_address,
    0, now() + (p_payment_timeout_minutes || ' minutes')::interval, true
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, price, stock_limit, stock_reserved
      into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid
      for update; -- 동시주문 시 행 잠금으로 경쟁상태 방지

    if v_product is null then
      raise exception 'PRODUCT_NOT_FOUND';
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

  update public.orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

-- ============================================================
-- 공구 자동마감 함수 (마감예정일시가 지나면 자동 마감처리)
-- ============================================================
create or replace function public.auto_close_expired_campaigns()
returns void
language plpgsql
as $$
begin
  update public.campaigns
  set is_closed = true,
      closed_at = now()
  where is_closed = false
    and close_deadline is not null
    and close_deadline < now();
end;
$$;

-- ============================================================
-- 미입금 자동취소 함수 (Supabase Cron으로 주기 실행)
-- ============================================================
create or replace function public.auto_cancel_unpaid_orders()
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select o.id as order_id, oi.product_id, oi.quantity
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.payment_status = '입금확인대기'
      and o.payment_deadline < now()
  loop
    perform public.release_stock(r.product_id, r.quantity);
  end loop;

  update public.orders
  set payment_status = '주문취소(미입금)'
  where payment_status = '입금확인대기'
    and payment_deadline < now();
end;
$$;

-- ============================================================
-- 진행자 상태변경 RPC 모음 (대시보드 버튼에서 호출)
-- 모두 SECURITY DEFINER로 만들지 않고, 호출 전 API 라우트에서
-- 진행자 세션(RLS)으로 해당 주문 소유 여부를 확인한 뒤 호출한다.
-- ============================================================

-- 입금확인 처리: 입금확인대기 -> 입금확인완료 (+ 배송상태 자동으로 배송준비)
create or replace function public.confirm_payment(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.orders
  set payment_status = '입금확인완료',
      payment_deadline = null -- 이후엔 자동취소 대상 아님
  where id = p_order_id and payment_status = '입금확인대기';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '입금확인대기', '입금확인완료');
end;
$$;

-- 입금확인 되돌리기: 입금확인완료 -> 입금확인대기 (타이머 없이 무기한 대기)
create or replace function public.revert_payment_confirm(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.orders
  set payment_status = '입금확인대기',
      payment_deadline = null, -- 무기한 대기, 자동취소 없음
      delivery_status = '배송준비'
  where id = p_order_id and payment_status = '입금확인완료';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '입금확인완료', '입금확인대기');
end;
$$;

-- 주문취소(미입금)에서 되돌리기: 재고 있을 때만 허용
create or replace function public.revert_cancel(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  -- 재고 여유 확인 (모든 상품에 대해)
  for r in
    select oi.product_id, oi.quantity, p.stock_limit, p.stock_reserved
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    if r.stock_reserved + r.quantity > r.stock_limit then
      raise exception 'OUT_OF_STOCK:%', r.product_id;
    end if;
  end loop;

  for r in
    select oi.product_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id
  loop
    update public.products set stock_reserved = stock_reserved + r.quantity where id = r.product_id;
  end loop;

  update public.orders
  set payment_status = '입금확인대기',
      payment_deadline = now() + interval '2 hours'
  where id = p_order_id and payment_status = '주문취소(미입금)';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '주문취소(미입금)', '입금확인대기');
end;
$$;

-- 배송상태 변경 (배송준비->배송중, 되돌리기 포함)
create or replace function public.set_delivery_status(p_order_id uuid, p_to delivery_status)
returns void
language plpgsql
as $$
declare
  v_from delivery_status;
begin
  select delivery_status into v_from from public.orders where id = p_order_id;

  update public.orders
  set delivery_status = p_to,
      delivery_completed_at = case when p_to = '배송완료' then now() else null end,
      delivery_photo_url = case when p_to <> '배송완료' then null else delivery_photo_url end
  where id = p_order_id;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, v_from::text, p_to::text);
end;
$$;

-- 일괄 배송중 처리 (배송준비 상태 건들 중 선택된 것들)
create or replace function public.bulk_set_shipping(p_order_ids uuid[])
returns void
language plpgsql
as $$
begin
  update public.orders
  set delivery_status = '배송중'
  where id = any(p_order_ids) and delivery_status = '배송준비';
end;
$$;

-- ============================================================
-- 개인정보 자동 폐기 함수 (배송완료 후 campaigns.data_retention_days 경과 시)
-- ============================================================
create or replace function public.purge_expired_personal_data()
returns void
language plpgsql
as $$
begin
  update public.orders o
  set nickname = '[삭제됨]',
      phone = '[삭제됨]',
      address = '[삭제됨]',
      pin_hash = '[삭제됨]'
  from public.campaigns c
  where o.campaign_id = c.id
    and o.delivery_status = '배송완료'
    and o.delivery_completed_at < now() - (c.data_retention_days || ' days')::interval
    and o.nickname <> '[삭제됨]';
end;
$$;

-- Supabase Cron 등록 예시 (Supabase 대시보드 SQL Editor에서 실행)
-- select cron.schedule('auto-cancel-unpaid', '*/5 * * * *', $$select public.auto_cancel_unpaid_orders();$$);
-- select cron.schedule('purge-expired-pii', '0 3 * * *', $$select public.purge_expired_personal_data();$$);
-- select cron.schedule('auto-close-campaigns', '* * * * *', $$select public.auto_close_expired_campaigns();$$);

-- ============================================================
-- 구매자 조회 무차별대입 방어용 시도 기록 (rate limit)
-- ============================================================
create table public.lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index idx_lookup_attempts_phone_time on public.lookup_attempts (phone, created_at);
alter table public.lookup_attempts enable row level security;
-- 정책을 두지 않아 클라이언트(anon/authenticated)는 접근 불가.
-- service_role(서버 API)만 접근 가능.

-- 최근 10분 내 실패 시도가 5회 이상이면 true(차단 대상) 반환
create or replace function public.is_lookup_blocked(p_phone text)
returns boolean
language sql
as $$
  select count(*) >= 5
  from public.lookup_attempts
  where phone = p_phone
    and succeeded = false
    and created_at > now() - interval '10 minutes';
$$;

-- ============================================================
-- Storage: 배송사진 버킷 (private + signed URL)
-- ============================================================
-- Supabase 대시보드에서 버킷 생성 시 Public 옵션 반드시 OFF
-- insert into storage.buckets (id, name, public) values ('delivery-photos', 'delivery-photos', false);
