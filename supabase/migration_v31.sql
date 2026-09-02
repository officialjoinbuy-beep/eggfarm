-- ============================================================
-- v31: 친구소개 보상을 추천인뿐 아니라 추천받은 사람(신규 가입자) 본인에게도
--      동일하게 지급하도록 확장 (기존엔 추천인만 3회 받았음)
-- ============================================================
create or replace function public.increment_campaign_count(p_owner_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_limit int;
  v_count int;
  v_referred_by uuid;
  v_rewarded boolean;
  v_referrer_limit int;
begin
  select campaign_limit, campaigns_created_count, referred_by, referral_rewarded
    into v_limit, v_count, v_referred_by, v_rewarded
  from public.account_limits
  where owner_id = p_owner_id
  for update;

  if v_limit is null then
    insert into public.account_limits (owner_id) values (p_owner_id)
    on conflict (owner_id) do nothing;
    v_limit := 10;
    v_count := 0;
  end if;

  if v_count >= v_limit then
    raise exception 'CAMPAIGN_LIMIT_REACHED';
  end if;

  update public.account_limits
  set campaigns_created_count = v_count + 1,
      trial_exhausted_at = case when v_count + 1 >= v_limit then now() else trial_exhausted_at end
  where owner_id = p_owner_id;

  -- 첫 공구 생성이고, 추천받은 사람이며, 아직 보상 안 받았으면
  -- 추천인 + 추천받은 본인 모두에게 3회씩 자동지급
  if v_count = 0 and v_referred_by is not null and not v_rewarded then
    select campaign_limit into v_referrer_limit
    from public.account_limits where owner_id = v_referred_by for update;

    if v_referrer_limit is not null then
      update public.account_limits
      set campaign_limit = v_referrer_limit + 3
      where owner_id = v_referred_by;

      insert into public.limit_increase_history (owner_id, previous_limit, new_limit, product_name)
      values (v_referred_by, v_referrer_limit, v_referrer_limit + 3, '친구소개 보상(3회)');

      -- 추천받은 본인에게도 3회 지급 (양방향 보상). 첫 공구가 마침 체험
      -- 마지막 회차였다면 이 보너스로 더 이상 소진 상태가 아니게 되므로
      -- trial_exhausted_at도 같이 정리한다.
      update public.account_limits
      set campaign_limit = campaign_limit + 3,
          referral_rewarded = true,
          trial_exhausted_at = case when v_count + 1 < campaign_limit + 3 then null else trial_exhausted_at end
      where owner_id = p_owner_id;

      insert into public.limit_increase_history (owner_id, previous_limit, new_limit, product_name)
      values (p_owner_id, v_limit, v_limit + 3, '친구소개로 가입 보상(3회)');

      insert into public.referral_rewards (referrer_id, referred_id, credits)
      values (v_referred_by, p_owner_id, 3);
    end if;
  end if;
end;
$$;
