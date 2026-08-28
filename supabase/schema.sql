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
  start_at timestamptz, -- 시작 예정일시(선택) - 예약생성용, 이 시각 전에는 주문접수 차단
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
create policy "owner_delete_campaigns" on public.campaigns
  for delete using (auth.uid() = owner_id);

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
  image_url text, -- 상품 사진(선택) - product-images 버킷의 public URL
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
-- 2-1. 배송 가능 아파트 단지(campaign_complexes) 테이블
-- ------------------------------------------------------------
-- 진행자가 실제 배송 가능한 범위만 등록. 등록된 단지가 하나도 없으면
-- 해당 공구는 주문접수 자체를 받지 않는다(배송 불가 지역 주문 방지).
create table public.campaign_complexes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.campaign_complexes enable row level security;

-- 구매자 화면에서 목록을 보여줘야 하므로 공개 조회 허용
create policy "public_select_complexes" on public.campaign_complexes
  for select using (true);
create policy "owner_insert_complexes" on public.campaign_complexes
  for insert with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "owner_delete_complexes" on public.campaign_complexes
  for delete using (
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
  address text not null, -- 단지명+동+호수를 조합한 표시용 전체 주소
  complex_name text, -- 단지명 (엑셀 분리 출력용)
  dong text, -- 동
  unit_no text, -- 호수 (4자리 0채움, 예: 0302, 1003)
  entry_password text, -- 공동현관 출입 비밀번호(선택)
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
  product_id uuid not null references public.products(id) on delete cascade,
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

-- ============================================================
-- Storage: 상품사진 버킷 (public - 구매자 화면에 그냥 노출되는 사진이라 공개로 둠)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

-- ============================================================
-- v7 확장: 현장픽업/현장결제, 배송담당자, 노쇼관리
-- ============================================================

-- orders: 수령방법/결제방법/픽업상태/QR토큰 추가
alter table public.orders
  alter column address drop not null; -- 현장픽업은 주소가 없을 수 있음

alter table public.orders
  add column if not exists fulfillment_type text not null default '배송'
    check (fulfillment_type in ('배송', '픽업')),
  add column if not exists payment_method text not null default '계좌이체'
    check (payment_method in ('계좌이체', '현장결제')),
  add column if not exists pickup_status text
    check (pickup_status in ('수령대기', '수령완료', '노쇼')),
  add column if not exists pickup_token text unique; -- QR코드에 담기는 추측불가 토큰

-- campaigns: 배송방식(직접/위임) + 건당 배송비
alter table public.campaigns
  add column if not exists delivery_mode text not null default '직접배송'
    check (delivery_mode in ('직접배송', '위임배송')),
  add column if not exists delivery_fee_per_order int not null default 0;

-- ------------------------------------------------------------
-- 배송담당자 링크 (공구+담당단지 단위로 발급, 로그인 없이 토큰으로만 접근)
-- ------------------------------------------------------------
create table public.delivery_staff_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token text not null unique,
  complex_ids uuid[] not null default '{}', -- 담당하는 campaign_complexes.id 목록
  fee_per_order int not null default 0,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.delivery_staff_links enable row level security;
create policy "owner_select_staff_links" on public.delivery_staff_links
  for select using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "owner_insert_staff_links" on public.delivery_staff_links
  for insert with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
create policy "owner_update_staff_links" on public.delivery_staff_links
  for update using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
  );
-- 배송담당자 본인(비로그인)의 접근은 service_role(서버 API)을 통해서만 처리.

-- ------------------------------------------------------------
-- 노쇼 기록 (전화번호는 HMAC 해시로만 저장 - 원본 복원 불가)
-- ------------------------------------------------------------
create table public.noshow_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  phone_hash text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_noshow_owner_phone on public.noshow_records (owner_id, phone_hash);
alter table public.noshow_records enable row level security;
create policy "owner_select_noshow" on public.noshow_records
  for select using (auth.uid() = owner_id);
create policy "owner_insert_noshow" on public.noshow_records
  for insert with check (auth.uid() = owner_id);

-- 2회 이상 노쇼면 차단 대상
create or replace function public.is_noshow_blocked(p_owner_id uuid, p_phone_hash text)
returns boolean
language sql
as $$
  select count(*) >= 2
  from public.noshow_records
  where owner_id = p_owner_id and phone_hash = p_phone_hash;
$$;

-- ------------------------------------------------------------
-- 현장픽업/현장결제 주문 생성 RPC (배송 주문과 재고 로직은 동일, 주소만 다름)
-- ------------------------------------------------------------
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
  v_is_closed boolean;
begin
  select is_closed into v_is_closed from public.campaigns where id = p_campaign_id for update;
  if v_is_closed then
    raise exception 'CAMPAIGN_CLOSED';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
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

-- 입금확인 처리 시 픽업 주문이면 배송상태 대신 픽업상태를 갱신하도록 확장
create or replace function public.confirm_payment(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_fulfillment text;
begin
  select fulfillment_type into v_fulfillment from public.orders where id = p_order_id;

  update public.orders
  set payment_status = '입금확인완료',
      payment_deadline = null,
      pickup_status = case when v_fulfillment = '픽업' then '수령대기' else pickup_status end
  where id = p_order_id and payment_status = '입금확인대기';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '입금확인대기', '입금확인완료');
end;
$$;

-- 여러 건 한번에 입금확인 처리
create or replace function public.bulk_confirm_payment(p_order_ids uuid[])
returns void
language plpgsql
as $$
begin
  update public.orders
  set payment_status = '입금확인완료',
      payment_deadline = null,
      pickup_status = case when fulfillment_type = '픽업' then '수령대기' else pickup_status end
  where id = any(p_order_ids) and payment_status = '입금확인대기';
end;
$$;

-- 픽업 상태 변경 (수령완료 / 노쇼) - 조건부 업데이트로 동시처리 안전
create or replace function public.set_pickup_status(p_order_id uuid, p_to text)
returns void
language plpgsql
as $$
declare
  v_from text;
begin
  select pickup_status into v_from from public.orders where id = p_order_id;

  update public.orders
  set pickup_status = p_to
  where id = p_order_id and pickup_status = '수령대기';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, coalesce(v_from, ''), p_to);
end;
$$;

-- 배송상태 변경을 조건부(현재 상태 일치 시에만)로 개선 - 동시처리 안전장치 통일
create or replace function public.set_delivery_status_safe(p_order_id uuid, p_from delivery_status, p_to delivery_status)
returns void
language plpgsql
as $$
begin
  update public.orders
  set delivery_status = p_to,
      delivery_completed_at = case when p_to = '배송완료' then now() else null end,
      delivery_photo_url = case when p_to <> '배송완료' then null else delivery_photo_url end
  where id = p_order_id and delivery_status = p_from;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, p_from::text, p_to::text);
end;
$$;

-- ============================================================
-- 개인정보 자동폐기 확장 (단지명/동/호수/출입비밀번호도 함께 삭제)
-- 배송사진 파일 자체(Storage)는 SQL로 지울 수 없어 별도 API에서 처리
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
      pin_hash = '[삭제됨]',
      complex_name = null,
      dong = null,
      unit_no = null,
      entry_password = null
  from public.campaigns c
  where o.campaign_id = c.id
    and o.delivery_status = '배송완료'
    and o.delivery_completed_at < now() - (c.data_retention_days || ' days')::interval
    and o.nickname <> '[삭제됨]';
end;
$$;

-- 배송사진 삭제 대상(파일 경로) 조회용 - API에서 이 목록을 받아 Storage에서 삭제 후
-- delivery_photo_url을 null로 비운다 (SQL 함수는 아래에 별도로 둠)
create or replace function public.list_expired_photo_paths()
returns table(order_id uuid, photo_path text)
language sql
as $$
  select o.id, o.delivery_photo_url
  from public.orders o
  join public.campaigns c on c.id = o.campaign_id
  where o.delivery_status = '배송완료'
    and o.delivery_photo_url is not null
    and o.delivery_completed_at < now() - (c.data_retention_days || ' days')::interval;
$$;

create or replace function public.clear_photo_url(p_order_id uuid)
returns void
language sql
as $$
  update public.orders set delivery_photo_url = null where id = p_order_id;
$$;

-- ============================================================
-- 공구 삭제 함수 (마감된 공구 + 관련 주문/상품/로그/배송담당자링크 전부 삭제)
-- ============================================================
create or replace function public.delete_campaign(p_campaign_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.campaigns where id = p_campaign_id;
  -- products, orders, order_items, order_status_logs, campaign_complexes,
  -- delivery_staff_links는 각 테이블에 "on delete cascade"로 걸려있어
  -- campaigns 삭제 시 자동으로 함께 삭제됨
end;
$$;

-- ============================================================
-- v8 확장: 상품별 구매상한, 수령서명, 배송담당자(이름/연락처 암호화+정산), UI 정리
-- ============================================================

-- 상품별 1인 구매 상한 (null = 제한 없음)
alter table public.products
  add column if not exists max_per_person int;

-- 픽업 수령완료 시 구매자 서명(이미지, base64 data URL로 저장 - 배송사진과 동일하게 15일 후 폐기)
alter table public.orders
  add column if not exists pickup_signature text;

-- campaigns에서 배송방식/건당배송비 필드 제거 (단지별 배송담당자 링크 유무로 자동 판단하는 방식으로 대체)
alter table public.campaigns
  drop column if exists delivery_mode,
  drop column if exists delivery_fee_per_order;

-- ------------------------------------------------------------
-- 배송담당자(사람) - 이름/연락처는 암호화하여 저장, 정산 목적으로 별도 보유주기 관리
-- ------------------------------------------------------------
create table public.delivery_staff (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name_enc text not null, -- AES-GCM 암호화된 이름 (base64: iv+tag+ciphertext)
  phone_enc text not null, -- AES-GCM 암호화된 연락처
  retention_expires_at timestamptz not null, -- 매년 12/31 자정, 무응답시 자동 1년 연장
  created_at timestamptz not null default now()
);
alter table public.delivery_staff enable row level security;
create policy "owner_select_staff" on public.delivery_staff
  for select using (auth.uid() = owner_id);
create policy "owner_insert_staff" on public.delivery_staff
  for insert with check (auth.uid() = owner_id);
create policy "owner_update_staff" on public.delivery_staff
  for update using (auth.uid() = owner_id);
create policy "owner_delete_staff" on public.delivery_staff
  for delete using (auth.uid() = owner_id);

-- 배송담당자 링크는 이제 특정 담당자(사람)에 연결됨
alter table public.delivery_staff_links
  add column if not exists staff_id uuid references public.delivery_staff(id) on delete set null;

-- 정산 추적: 어떤 담당자가 처리했는지 + 그때 적용된 건당단가 스냅샷
-- (링크의 fee_per_order가 나중에 바뀌어도 과거 정산액은 그대로 유지됨)
alter table public.orders
  add column if not exists completed_by_staff_id uuid references public.delivery_staff(id) on delete set null,
  add column if not exists staff_fee_amount int not null default 0;

-- 매년 1/1에 실행: 진행자가 응답 안 한(만료된) 배송담당자 정보는 자동으로 1년 연장
create or replace function public.auto_renew_staff_retention()
returns void
language plpgsql
as $$
begin
  update public.delivery_staff
  set retention_expires_at = make_timestamptz(extract(year from retention_expires_at)::int + 1, 12, 31, 23, 59, 59, 'Asia/Seoul')
  where retention_expires_at < now();
end;
$$;

-- 픽업완료 시각 (배송의 delivery_completed_at에 대응 - 15일 보유기간 기산점)
alter table public.orders
  add column if not exists pickup_completed_at timestamptz;

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
      pickup_completed_at = case when p_to = '수령완료' then now() else pickup_completed_at end
  where id = p_order_id and pickup_status = '수령대기';

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, coalesce(v_from, ''), p_to);
end;
$$;

-- 개인정보 자동폐기 확장: 픽업 주문(서명 포함)도 포함
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
    )
    and o.nickname <> '[삭제됨]';
end;
$$;

-- ============================================================
-- v9 확장: 마감취소, 위임배송 링크 중복생성 방지, 배송담당자 검색/삭제 보호,
--          노쇼 차단 해제
-- ============================================================

-- ------------------------------------------------------------
-- 1. 마감취소 (조기마감을 되돌림)
-- ------------------------------------------------------------
-- 위임배송 링크가 하나라도 살아있으면(무효화 안됐고 만료 안됨) 마감취소 불가.
-- 마감취소되면 주문접수 링크가 다시 열리고(is_closed=false), 기존에 쌓인
-- 주문/배송/입금 데이터는 전혀 건드리지 않는다 - 추가 주문만 새로 받을 수 있게 된다.
create or replace function public.reopen_campaign(p_campaign_id uuid)
returns void
language plpgsql
as $$
declare
  v_has_live_link boolean;
  v_is_closed boolean;
begin
  -- 동시 요청 방지를 위해 캠페인 행 잠금
  select is_closed into v_is_closed from public.campaigns where id = p_campaign_id for update;

  if v_is_closed is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if not v_is_closed then
    raise exception 'ALREADY_OPEN';
  end if;

  select exists (
    select 1 from public.delivery_staff_links
    where campaign_id = p_campaign_id
      and not revoked
      and expires_at > now()
  ) into v_has_live_link;

  if v_has_live_link then
    raise exception 'HAS_ACTIVE_STAFF_LINK';
  end if;

  update public.campaigns
  set is_closed = false,
      closed_at = null
  where id = p_campaign_id;
end;
$$;

-- ------------------------------------------------------------
-- 2. 위임배송 링크 생성 원자화 (같은 단지에 살아있는 링크 중복 생성 방지)
-- ------------------------------------------------------------
-- 기존에는 API 라우트에서 체크 없이 바로 insert하여, 버튼을 두 번 누르거나
-- 모달을 다시 열어 생성하면 같은 단지를 담당하는 링크가 2개 이상 동시에
-- 살아있을 수 있었다(배송담당자 판단 로직이 꼬이는 원인). 캠페인 행을 잠그고
-- 겹치는 단지가 있는 살아있는 링크가 있는지 확인한 뒤 원자적으로 생성한다.
create or replace function public.create_delivery_staff_link(
  p_campaign_id uuid,
  p_complex_ids uuid[],
  p_fee_per_order int,
  p_staff_id uuid,
  p_expires_at timestamptz
)
returns table(id uuid, token text, expires_at timestamptz)
language plpgsql
as $$
declare
  v_conflict boolean;
  v_owner_id uuid;
  v_staff_owner_id uuid;
  v_token text;
  v_id uuid;
begin
  select owner_id into v_owner_id from public.campaigns where id = p_campaign_id for update;
  if v_owner_id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select owner_id into v_staff_owner_id from public.delivery_staff where id = p_staff_id;
  if v_staff_owner_id is null or v_staff_owner_id <> v_owner_id then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  select exists (
    select 1 from public.delivery_staff_links
    where campaign_id = p_campaign_id
      and not revoked
      and expires_at > now()
      and complex_ids && p_complex_ids
  ) into v_conflict;

  if v_conflict then
    raise exception 'COMPLEX_ALREADY_DELEGATED';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.delivery_staff_links (campaign_id, token, complex_ids, fee_per_order, staff_id, expires_at)
  values (p_campaign_id, v_token, p_complex_ids, p_fee_per_order, p_staff_id, p_expires_at)
  returning delivery_staff_links.id into v_id;

  return query select v_id, v_token, p_expires_at;
end;
$$;

-- ------------------------------------------------------------
-- 3. 배송담당자 목록 + 마지막 건당배송비 (위임배송 등록 시 자동 채움용)
-- ------------------------------------------------------------
create or replace function public.list_staff_with_last_fee(p_owner_id uuid)
returns table(
  id uuid,
  name_enc text,
  phone_enc text,
  retention_expires_at timestamptz,
  created_at timestamptz,
  last_fee_per_order int
)
language sql
as $$
  select
    s.id, s.name_enc, s.phone_enc, s.retention_expires_at, s.created_at,
    (
      select l.fee_per_order from public.delivery_staff_links l
      where l.staff_id = s.id
      order by l.created_at desc
      limit 1
    ) as last_fee_per_order
  from public.delivery_staff s
  where s.owner_id = p_owner_id
  order by s.created_at desc;
$$;

-- ------------------------------------------------------------
-- 4. 노쇼 차단 해제 (오판 노쇼를 관리자가 제외 처리)
-- ------------------------------------------------------------
alter table public.noshow_records
  add column if not exists excluded_at timestamptz;

-- 기존엔 select/insert 정책만 있고 update 정책이 없어 제외 처리(update)가
-- RLS에 막혀 실제로는 아무 것도 바뀌지 않는 문제가 있었음 - update 정책 추가.
create policy "owner_update_noshow" on public.noshow_records
  for update using (auth.uid() = owner_id);

-- 2회 이상 노쇼면 차단 대상 (제외 처리된 기록은 카운트에서 빠짐)
create or replace function public.is_noshow_blocked(p_owner_id uuid, p_phone_hash text)
returns boolean
language sql
as $$
  select count(*) filter (where excluded_at is null) >= 2
  from public.noshow_records
  where owner_id = p_owner_id and phone_hash = p_phone_hash;
$$;

-- 현재 차단 상태인 전화번호(해시) 그룹 목록 (진행자 화면용)
create or replace function public.list_noshow_groups(p_owner_id uuid)
returns table(
  phone_hash text,
  active_count bigint,
  last_order_id uuid,
  last_created_at timestamptz
)
language sql
as $$
  select
    phone_hash,
    count(*) filter (where excluded_at is null) as active_count,
    (array_agg(order_id order by created_at desc))[1] as last_order_id,
    max(created_at) as last_created_at
  from public.noshow_records
  where owner_id = p_owner_id
  group by phone_hash
  having count(*) filter (where excluded_at is null) >= 2
  order by max(created_at) desc;
$$;

-- 특정 전화번호(해시)의 노쇼 기록을 전부 "제외" 처리 (차단 해제)
create or replace function public.exclude_noshow_group(p_owner_id uuid, p_phone_hash text)
returns void
language plpgsql
as $$
begin
  update public.noshow_records
  set excluded_at = now()
  where owner_id = p_owner_id
    and phone_hash = p_phone_hash
    and excluded_at is null;
end;
$$;
