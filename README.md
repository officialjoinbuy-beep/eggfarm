# 공동구매 주문취합 플랫폼 (셀프유즈 MVP)

Next.js + Supabase로 만든 개인 사용 목적의 공동구매 주문접수/입금확인/배송관리 도구입니다.

## 1. Supabase 프로젝트 준비

1. https://supabase.com 에서 새 프로젝트 생성
2. 좌측 메뉴 **SQL Editor** → `supabase/schema.sql` 파일 내용 전체 복사해서 실행
3. **Storage** → New bucket → 이름 `delivery-photos`, **Public 옵션은 반드시 OFF**
4. **Authentication → Providers** → Email 활성화 확인 (기본 활성화되어 있음)
5. **Authentication → Email Templates**에서 "Confirm signup" 발송 여부 확인 (개인 사용이면 껐다 켜도 무방)
6. (선택) **Database → Extensions**에서 `pg_cron` 활성화 후, SQL Editor에서 아래 실행:
   ```sql
   select cron.schedule('auto-cancel-unpaid', '*/5 * * * *', $$select public.auto_cancel_unpaid_orders();$$);
   select cron.schedule('purge-expired-pii', '0 3 * * *', $$select public.purge_expired_personal_data();$$);
   ```
   pg_cron을 못 쓰는 플랜이면, 외부 스케줄러(예: Vercel Cron, GitHub Actions)에서
   위 두 함수를 주기적으로 `supabase.rpc()`로 호출하도록 대체 가능합니다.

## 2. 환경변수 설정

`.env.example`을 `.env.local`로 복사 후, Supabase 프로젝트 설정 > API 페이지에서
값을 채워 넣으세요.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # 절대 외부 공개 금지
```

## 3. 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000 접속

## 4. 배포 (Vercel)

1. 이 폴더를 GitHub 저장소로 push
2. Vercel에서 Import → 위 환경변수 3개를 Vercel 프로젝트 설정에 등록
3. Deploy

## 5. 사용 흐름

1. `/admin/signup` 에서 진행자 계정 생성 (이메일 인증 필요할 수 있음)
2. `/admin/login` 로그인 → `/admin/new`에서 공구(상품/계좌정보) 등록
3. 등록 완료 시 이동하는 `/admin/[campaignId]` 가 진행자 대시보드
4. 구매자에게 공유할 링크:
   - 주문접수: `https://내도메인/order/[campaignId]`
   - 주문조회: `https://내도메인/lookup/[campaignId]`
5. 대시보드에서 입금확인 → 배송준비 자동 전환 → 일괄 배송중 처리 → 건별 배송완료(사진업로드)
6. 조기마감 또는 마감 후 "집계표 다운로드"로 발주요약/주문자상세 엑셀 확보

## 폴더 구조 요약

- `supabase/schema.sql` — 테이블, RLS, 재고 원자적 처리 함수, 자동취소/개인정보폐기 함수
- `app/order/[campaignId]` — 구매자 주문접수 + 입금안내
- `app/lookup/[campaignId]` — 구매자 주문조회(연락처+PIN)
- `app/admin/*` — 진행자 로그인/회원가입/공구설정/대시보드
- `app/api/*` — 재고 원자적 처리, 상태변경, 사진업로드, 엑셀 다운로드 등 서버 로직

## 보안 관련 기본 반영 사항

- RLS: 진행자는 본인 소유 공구 데이터만 접근, 구매자 개인정보 직접 조회 불가(서버 API 경유만)
- Storage: `delivery-photos` 버킷 private + signed URL(10분 유효)로만 열람
- 구매자 조회 API: 10분 내 5회 실패 시 자동 차단(rate limit)
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 API route에서만 사용, 클라이언트 번들에 노출되지 않음(`server-only` 패키지로 강제)
- 재고차감/주문생성/마감처리는 DB 트랜잭션(Postgres 함수, `for update` 행잠금)으로 원자적 처리 → 동시주문 시 재고 초과 방지
