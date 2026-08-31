import Link from "next/link";
import AutoCarousel from "@/components/AutoCarousel";

const PROBLEMS = [
  {
    icon: "💬",
    title: "일일이 손으로 취합",
    desc: "채팅방 메시지 하나하나 세어가며 집계",
  },
  {
    icon: "💸",
    title: "입금확인이 뒤죽박죽",
    desc: "누가 냈는지 통장내역과 대조하느라 시간낭비",
  },
  {
    icon: "❓",
    title: "반복되는 문의",
    desc: '"저 주문했나요?" 매번 찾아서 답장',
  },
];

const FEATURES = [
  {
    icon: "🔗",
    title: "링크 하나로 주문접수",
    desc: "채팅방에 링크만 공유하면 자동으로 집계표까지 완성",
  },
  {
    icon: "📱",
    title: "QR 현장수령",
    desc: "스캔 한 번으로 수령 확인, 중복수령도 자동 방지",
  },
  {
    icon: "🚚",
    title: "배송관리",
    desc: "배송담당자 위임부터 사진 전달까지 한번에",
  },
];

const TIERS = [
  { name: "기본형", desc: "주문접수 · 입금확인 · 현장수령", featured: false },
  { name: "중간형", desc: "기본형 + QR수령 또는 배송관리", featured: true },
  { name: "하이브리드형", desc: "QR수령 + 배송관리 전체 기능", featured: false },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const signupHref = ref ? `/admin/signup?ref=${encodeURIComponent(ref)}` : "/admin/signup";

  return (
    <main>
      {/* 히어로 */}
      <section className="max-w-2xl mx-auto px-5 text-center pt-16 pb-14">
        <p className="text-[13px] text-neutral-400 mb-2">오더모아 OrderMoa</p>
        <h1 className="text-[26px] sm:text-[30px] font-medium leading-snug mb-3">
          공동구매 오픈채팅 운영하면서
          <br />
          &apos;수기취합&apos;은 이제 그만
        </h1>
        <p className="text-[15px] text-neutral-500 max-w-sm mx-auto mb-7 leading-relaxed">
          링크 하나로 주문 받고, 자동으로 집계까지.
          <br />
          공동구매 진행자를 위한 가장 쉬운 주문관리 도구예요.
        </p>
        <Link
          href={signupHref}
          className="inline-block bg-neutral-900 text-white rounded-lg px-7 py-3 text-[15px] font-medium"
        >
          10회 무료체험하기
        </Link>
      </section>

      {/* 문제 제기 */}
      <section className="bg-amber-50/60 border-y border-amber-100">
        <div className="max-w-2xl mx-auto px-5 py-14">
          <AutoCarousel items={PROBLEMS} variant="plain" />
          <div className="hidden sm:grid grid-cols-3 gap-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="bg-white rounded-xl p-5 text-center">
                <p className="text-[22px] mb-2">{p.icon}</p>
                <p className="text-[14px] font-medium mb-1">{p.title}</p>
                <p className="text-[13px] text-neutral-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-[13px] text-neutral-400 text-center mb-1">오더모아가 해결해드려요</p>
        <h2 className="text-[20px] font-medium text-center mb-6">필요한 기능, 이미 다 있어요</h2>
        <AutoCarousel items={FEATURES} variant="bordered" />
        <div className="hidden sm:grid grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-neutral-200 rounded-xl p-5">
              <p className="text-[20px] mb-2">{f.icon}</p>
              <p className="text-[14px] font-medium mb-1">{f.title}</p>
              <p className="text-[13px] text-neutral-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 요금제 - 가격은 노출하지 않고 등급만 소개 */}
      <section className="bg-neutral-900 text-white">
        <div className="max-w-2xl mx-auto px-5 py-14">
          <p className="text-[13px] text-neutral-400 text-center mb-1">이용 안내</p>
          <h2 className="text-[20px] font-medium text-center mb-2">필요한 만큼 골라 쓰세요</h2>
          <p className="text-[14px] text-neutral-400 text-center mb-7 leading-relaxed">
            가입하면 10회까지 모든 기능을 무료로 체험할 수 있어요.
            <br />
            이후 이용 등급은 체험해보신 뒤 안내해드려요.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative bg-neutral-800 rounded-xl p-5 text-center ${
                  t.featured ? "border-2 border-amber-400" : "border border-neutral-700"
                }`}
              >
                {t.featured && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-neutral-900 text-[11px] px-2.5 py-0.5 rounded whitespace-nowrap font-medium">
                    가장 많이 선택
                  </span>
                )}
                <p className="text-[14px] font-medium mb-1.5 mt-1">{t.name}</p>
                <p className="text-[12px] text-neutral-400 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link
              href={signupHref}
              className="inline-block bg-amber-400 text-neutral-900 rounded-lg px-7 py-3 text-[15px] font-medium"
            >
              무료로 체험해보기
            </Link>
            <p className="text-[12px] text-neutral-500 mt-3">신용카드 등록 없이 바로 시작</p>
          </div>
        </div>
      </section>

      <footer className="text-center py-10">
        <Link href="/admin/login" className="text-[13px] text-neutral-400 underline">
          이미 계정이 있으신가요? 로그인
        </Link>
      </footer>
    </main>
  );
}
