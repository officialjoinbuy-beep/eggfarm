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

  if (connected === null || dismissed) return null;

  if (connected) {
    return (
      <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-4 px-0.5">
        <span>✓ 카카오 알림 연동됨</span>
        <a href="/api/kakao/authorize" className="underline">
          알림이 안 온다면 재연결
        </a>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 rounded-lg px-3.5 py-2.5 mb-4 text-[12px]">
      <div className="flex items-center justify-between">
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
      <p className="text-neutral-500 mt-1.5 leading-relaxed">
        연결 화면에서 <strong className="text-neutral-700">"카카오톡 메시지 전송"</strong> 항목을
        꼭 체크해주세요. 체크 안 하면 알림이 오지 않아요. (알림이 안 온다면 연결하기를 다시 눌러
        재연결해보세요)
      </p>
    </div>
  );
}
