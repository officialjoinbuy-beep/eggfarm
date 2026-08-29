"use client";

import { useEffect, useState } from "react";

// 공구 생성 80회부터 잔여횟수 안내, 95회부터 경고색으로 전환.
// 100회(한도) 도달 이후의 안내는 공구 생성 시도 시 뜨는 LimitReachedModal에서 처리한다.
export default function TrialUsageBanner() {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/account-limit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsage(data));
  }, []);

  if (!usage) return null;
  const warnAt = Math.max(0, usage.limit - 20); // 기본 100회 기준 80부터
  const dangerAt = Math.max(0, usage.limit - 5); // 기본 100회 기준 95부터
  if (usage.used < warnAt) return null;

  const remaining = Math.max(0, usage.limit - usage.used);
  const danger = usage.used >= dangerAt;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 mb-4 text-[13px] ${
        danger ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span>{danger ? "⚠️" : "📊"}</span>
      <span>
        공구 생성 {usage.used}/{usage.limit}회 사용 중 — 잔여 {remaining}회
      </span>
    </div>
  );
}
