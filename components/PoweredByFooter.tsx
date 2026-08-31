import Link from "next/link";

// 구매자 화면 하단에 작게 노출되는 자연유입 문구.
// 공구 운영에 관심있는 구매자가 오더모아 소개페이지로 자연스럽게 유입되도록 유도.
export default function PoweredByFooter() {
  return (
    <div className="text-center mt-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3.5 py-1.5 font-medium hover:bg-amber-100 active:scale-95 transition-transform"
      >
        🎁 나도 공구 링크 만들어보기 →
      </Link>
      <p className="text-[10px] text-neutral-300 mt-1.5">Powered by 오더모아</p>
    </div>
  );
}
