"use client";

import { useEffect, useState } from "react";

// 새 주문 접수 시 카카오톡으로 알림받을 수 있도록 연결을 유도하는 배너.
// 이미 연결된 진행자에게는 아무것도 보여주지 않는다.
export default function KakaoConnectBanner() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/kakao-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setConnected(!!data?.connected));
  }, []);

  if (connected !== false || dismissed) return null;

  return (
    <div className="flex items-center justify-between bg-yellow-50 rounded-lg px-3.5 py-2.5 mb-4 text-[12px]">
      <span>💬 새 주문 접수 시 카톡으로 바로 알림받으세요</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <a href="/api/kakao/authorize" className="underline font-medium">
          연결하기
        </a>
        <button onClick={() => setDismissed(true)} className="text-neutral-400">
          ✕
        </button>
      </div>
    </div>
  );
}
