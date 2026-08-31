-- ============================================================
-- v30: 픽업(수령완료) 매출이 delivery_revenue_log에서 빠져있던 버그 수정
--      - 지금까지는 배송(delivery_status='배송완료')만 매출로 기록되고
--        픽업(pickup_status='수령완료')은 아무리 완료해도 집계되지 않았음.
--      - 앞으로는 배송/픽업 완료 모두 delivery_revenue_log에 기록되도록 수정.
-- ============================================================

create or replace function public.set_pickup_status(p_order_id uuid, p_to text)
returns void
language plpgsql
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

  delete from public.delivery_revenue_log where order_id = p_order_id;

  insert into public.order_status_logs (order_id, from_status, to_status)
  values (p_order_id, '수령완료', '수령대기');
end;
$$;

-- 이미 수령완료 처리됐던 픽업 주문들을 소급 백필
insert into public.delivery_revenue_log (order_id, owner_id, campaign_id, campaign_title, amount, completed_at)
select o.id, c.owner_id, c.id, c.title, o.total_amount, coalesce(o.pickup_completed_at, now())
from public.orders o
join public.campaigns c on c.id = o.campaign_id
where o.pickup_status = '수령완료'
on conflict (order_id) do nothing;
