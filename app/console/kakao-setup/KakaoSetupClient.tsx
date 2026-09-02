"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// 진행자(ARININE) 본인의 카카오 알림 인증 1회용 화면.
// /api/kakao/authorize?mode=admin 을 거쳐 여기로 refresh_token이 담겨 돌아온다.
export default function KakaoSetupClient() {
  const searchParams = useSearchParams();
  const refreshToken = searchParams.get("refresh_token");
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!refreshToken) return;
    navigator.clipboard.writeText(refreshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
      <p className="text-[16px] font-medium mb-4 text-center">카카오 알림 설정</p>

      {!refreshToken && (
        <>
          <p className="text-[13px] text-neutral-500 mb-5 text-center leading-relaxed">
            크레딧 구매요청 등 알림을 카카오톡으로 받으려면,
            <br />
            본인 카카오 계정 인증이 1회 필요해요.
          </p>
          <a
            href="/api/kakao/authorize?mode=admin"
            className="block w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium text-center"
          >
            카카오로 인증하기
          </a>
        </>
      )}

      {refreshToken && (
        <>
          <p className="text-[13px] text-neutral-500 mb-3 text-center leading-relaxed">
            인증 완료! 아래 값을 복사해서 Vercel 환경변수
            <br />
            <span className="font-mono text-[12px] bg-white px-1.5 py-0.5 rounded border">
              KAKAO_ADMIN_REFRESH_TOKEN
            </span>
            에 등록해주세요.
          </p>
          <button
            onClick={copy}
            className="w-full bg-white border rounded-lg px-3 py-2.5 text-left text-[12px] font-mono break-all mb-2"
          >
            {refreshToken}
          </button>
          {copied && <p className="text-[12px] text-green-600 text-center mb-2">복사됐습니다</p>}
          <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
            등록 후 재배포하시면 크레딧 구매요청이 들어올 때마다
            <br />
            진행자 본인 카카오톡으로 알림이 옵니다.
          </p>
        </>
      )}

      <Link href="/console" className="block text-center text-[12px] text-neutral-400 underline mt-5">
        콘솔로 돌아가기
      </Link>
    </div>
  );
}
