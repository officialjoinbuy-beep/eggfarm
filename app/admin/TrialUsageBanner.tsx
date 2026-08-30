"use client";

import { useEffect, useState } from "react";

type Usage = {
  used: number;
  limit: number;
  productName: string | null;
  purchasedAt: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 이용현황 배너: 항상 노출하고, 사용률만큼 빨간 막대가 차오르는 게이지로 표시.
export default function TrialUsageBanner() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/admin/account-limit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsage(data));
  }, []);

  if (!usage) return null;

  const percent = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const label = usage.productName || "체험판 크레딧";
  const purchasedDate = formatDate(usage.purchasedAt);

  return (
    <div className="bg-neutral-50 rounded-lg px-3.5 py-3 mb-4">
      <div className="flex items-center justify-between text-[12px] text-neutral-600 mb-1.5">
        <span>
          {label} ({usage.used}/{usage.limit} · {percent}%사용)
        </span>
        {purchasedDate && <span className="text-neutral-400">구매일자 {purchasedDate}</span>}
      </div>
      <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
