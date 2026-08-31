-- ============================================================
-- v29: 단지 주소 정확도 개선(카카오맵 연동), 주문조회 공지 배너
-- ============================================================

-- 배송 가능 단지에 도로명주소 + 카카오맵 고유 ID를 같이 저장해,
-- 동일한 이름의 아파트가 여러 동네에 있어도 정확히 구분할 수 있게 한다.
-- 기존 데이터(이름만 있는 단지)는 road_address/kakao_place_id가 null인 채로
-- 그대로 동작한다(하위호환).
alter table public.campaign_complexes
  add column if not exists road_address text,
  add column if not exists kakao_place_id text;

-- 공구별 공지문구. 진행자가 입력하면 구매자 "내 주문 조회" 화면 상단에
-- 배너로 노출된다(발송이 아닌 노출 방식이라 별도 비용 없음).
alter table public.campaigns
  add column if not exists notice_text text;
