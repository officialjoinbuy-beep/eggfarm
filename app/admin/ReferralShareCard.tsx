"use client";

import { useEffect, useState } from "react";
import { shareReferralLink } from "@/lib/kakao-share";

// 친구소개 링크 공유 카드. 피추천인이 첫 공구를 만들면 본인에게 3회 크레딧이 자동 지급된다.
// 카카오톡 공유 버튼은 NEXT_PUBLIC_KAKAO_JS_KEY가 설정되면 자동으로 활성화되고,
// 아직 없으면 조용히 숨겨진 채로 "링크 복사"만 보여준다.
export default function ReferralShareCard() {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const kakaoEnabled = !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  useEffect(() => {
    fetch("/api/admin/referral-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReferralCode(data?.referralCode ?? null));
  }, []);

  if (!referralCode) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${referralCode}`
      : `/?ref=${referralCode}`;

  function copy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareToKakao() {
    const ok = await shareReferralLink(link, referralCode!);
    if (!ok) copy(); // 공유 실패 시 복사로 대체
  }

  return (
    <div className="bg-neutral-50 rounded-lg px-3.5 py-3 mb-4">
      <p className="text-[13px] font-medium mb-1">🎁 친구에게 추천하고 크레딧 받기</p>
      <p className="text-[12px] text-neutral-500 mb-2">
        아래 링크로 가입한 친구가 첫 공구를 만들면, 친구와 나 둘 다 3회씩 크레딧을 받아요.
      </p>
      <button
        onClick={copy}
        className="w-full flex items-center justify-between bg-white border rounded-lg px-3 py-2 mb-1.5"
      >
        <span className="text-[12px] text-neutral-600 truncate">{link}</span>
        <span className="text-[12px] text-neutral-400 flex-shrink-0 ml-2">복사</span>
      </button>
      {kakaoEnabled && (
        <button
          onClick={shareToKakao}
          className="w-full bg-[#FEE500] text-[#191919] rounded-lg py-2 text-[12px] font-medium"
        >
          카카오톡으로 공유하기
        </button>
      )}
      {copied && <p className="text-[12px] text-green-600 mt-1.5">링크가 복사됐습니다</p>}
    </div>
  );
}
