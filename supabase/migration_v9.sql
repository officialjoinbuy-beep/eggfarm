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
returns table(link_id uuid, link_token text, link_expires_at timestamptz)
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
-- (재실행해도 안전하도록 먼저 지우고 다시 생성)
drop policy if exists "owner_update_noshow" on public.noshow_records;
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
