"use client";

import { useEffect, useState } from "react";

// 친구소개 링크 공유 카드. 피추천인이 첫 공구를 만들면 본인에게 3회 크레딧이 자동 지급된다.
// 카카오톡 공유(Kakao Share) 버튼은 도메인/JS키 준비 후 추가 예정 - 지금은 링크 복사로 대체.
export default function ReferralShareCard() {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/referral-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReferralCode(data?.referralCode ?? null));
  }, []);

  if (!referralCode) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/admin/signup?ref=${referralCode}`
      : `/admin/signup?ref=${referralCode}`;

  function copy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-neutral-50 rounded-lg px-3.5 py-3 mb-4">
      <p className="text-[13px] font-medium mb-1">🎁 친구에게 추천하고 크레딧 받기</p>
      <p className="text-[12px] text-neutral-500 mb-2">
        아래 링크로 가입한 친구가 첫 공구를 만들면, 3회 크레딧을 드려요.
      </p>
      <button
        onClick={copy}
        className="w-full flex items-center justify-between bg-white border rounded-lg px-3 py-2"
      >
        <span className="text-[12px] text-neutral-600 truncate">{link}</span>
        <span className="text-[12px] text-neutral-400 flex-shrink-0 ml-2">복사</span>
      </button>
      {copied && <p className="text-[12px] text-green-600 mt-1.5">링크가 복사됐습니다</p>}
    </div>
  );
}
