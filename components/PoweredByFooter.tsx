import Link from "next/link";

// 구매자 화면 하단에 작게 노출되는 자연유입 문구.
// 공구 운영에 관심있는 구매자가 오더모아 소개페이지로 자연스럽게 유입되도록 유도.
export default function PoweredByFooter() {
  return (
    <p className="text-[11px] text-neutral-300 text-center mt-4">
      <Link href="/" className="hover:text-neutral-400">
        Powered by 오더모아 · 나도 공구 링크 만들어보기
      </Link>
    </p>
  );
}
