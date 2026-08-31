"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import Spinner from "@/components/Spinner";

type Report = {
  totalOrders: number;
  totalRevenue: number;
  repeatCustomerRate: number;
  byProduct: { name: string; qty: number; revenue: number }[];
  byCampaign: { campaignId: string; title: string; orders: number; revenue: number }[];
};

export default function ReportsClient() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports")
      .then((res) => (res.ok ? res.json() : null))
      .then(setReport);
  }, []);

  if (!report) {
    return (
      <main className="max-w-md mx-auto p-5 flex justify-center py-16">
        <Spinner />
      </main>
    );
  }

  const maxProductRevenue = Math.max(1, ...report.byProduct.map((p) => p.revenue));

  return (
    <main className="max-w-md mx-auto p-5">
      <Link href="/admin" className="text-[13px] text-neutral-400 mb-3 inline-block">
        ← 내 공구 목록
      </Link>
      <p className="text-[18px] font-medium mb-4">매출 리포트</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-neutral-50 rounded-lg p-2.5">
          <p className="text-[11px] text-neutral-500 mb-1">누적 매출</p>
          <p className="text-[15px] font-medium">{formatWon(report.totalRevenue)}</p>
        </div>
        <div className="bg-neutral-50 rounded-lg p-2.5">
          <p className="text-[11px] text-neutral-500 mb-1">누적 주문</p>
          <p className="text-[15px] font-medium">{report.totalOrders}건</p>
        </div>
        <div className="bg-neutral-50 rounded-lg p-2.5">
          <p className="text-[11px] text-neutral-500 mb-1">재구매 고객</p>
          <p className="text-[15px] font-medium">{report.repeatCustomerRate}%</p>
        </div>
      </div>

      <p className="text-[13px] font-medium mb-2">상품별 판매현황</p>
      {report.byProduct.length === 0 && (
        <p className="text-[13px] text-neutral-400 py-4 text-center">아직 데이터가 없습니다.</p>
      )}
      <div className="flex flex-col gap-2 mb-6">
        {report.byProduct.map((p) => (
          <div key={p.name}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="font-medium">{p.name}</span>
              <span className="text-neutral-500">
                {p.qty}개 · {formatWon(p.revenue)}
              </span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-800 rounded-full"
                style={{ width: `${(p.revenue / maxProductRevenue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[13px] font-medium mb-2">공구별 매출</p>
      <div className="flex flex-col gap-2">
        {report.byCampaign.map((c) => (
          <div key={c.campaignId} className="border rounded-lg p-3 flex items-center justify-between">
            <p className="text-[13px] truncate flex-1">{c.title}</p>
            <p className="text-[12px] text-neutral-500 flex-shrink-0 ml-2">
              {c.orders}건 · {formatWon(c.revenue)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
