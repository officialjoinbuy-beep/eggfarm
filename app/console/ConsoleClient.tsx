"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

type Signup = {
  owner_id: string;
  email: string;
  campaign_limit: number;
  campaigns_created_count: number;
  trial_exhausted_at: string | null;
  created_at: string;
  last_purchase_product_name: string | null;
  last_purchase_at: string | null;
};
type PurchaseRequest = {
  id: string;
  owner_id: string;
  email: string;
  product_name: string;
  credit_amount: number;
  price: number;
  status: "대기" | "완료";
  requested_at: string;
  applied_at: string | null;
};
type HistoryRow = {
  id: string;
  owner_id: string;
  email: string;
  previous_limit: number | null;
  new_limit: number;
  product_name: string | null;
  created_at: string;
};

function fmt(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ConsoleClient() {
  const [tab, setTab] = useState<"signups" | "requests" | "history">("requests");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/console/data");
    if (res.ok) {
      const data = await res.json();
      setSignups(data.signups);
      setRequests(data.requests);
      setHistory(data.history);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function applyRequest(id: string) {
    if (!confirm("입금 확인이 완료됐나요? 확인하면 즉시 한도가 늘어납니다.")) return;
    setApplyingId(id);
    await fetch("/api/console/apply-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id }),
    });
    setApplyingId(null);
    load();
  }

  const pendingRequests = requests.filter((r) => r.status === "대기");

  return (
    <div>
      <p className="text-[18px] font-medium mb-4">운영 콘솔</p>

      <div className="flex border-b mb-4 text-[13px]">
        {[
          { key: "requests", label: `구매요청 (${pendingRequests.length})` },
          { key: "signups", label: `가입자 (${signups.length})` },
          { key: "history", label: "증량이력" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-3 py-2 -mb-px border-b-2 ${
              tab === t.key ? "border-neutral-900 font-medium" : "border-transparent text-neutral-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-[13px] text-neutral-400 py-6 text-center">불러오는 중...</p>}

      {!loading && tab === "requests" && (
        <div className="flex flex-col gap-2">
          {requests.length === 0 && (
            <p className="text-[13px] text-neutral-400 py-6 text-center">요청이 없습니다.</p>
          )}
          {requests.map((r) => (
            <div key={r.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-medium">{r.email}</p>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    r.status === "대기" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-[12px] text-neutral-500">
                {r.product_name} · {r.credit_amount}회 · {r.price.toLocaleString()}원
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">요청 {fmt(r.requested_at)}</p>
              {r.status === "대기" && (
                <button
                  onClick={() => applyRequest(r.id)}
                  disabled={applyingId === r.id}
                  className="mt-2 w-full bg-neutral-900 text-white rounded-lg py-2 text-[12px] disabled:opacity-50 flex items-center justify-center"
                >
                  {applyingId === r.id && <Spinner className="w-3 h-3" />}
                  입금확인됨 - 한도 적용
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "signups" && (
        <div className="flex flex-col gap-2">
          {signups.map((s) => (
            <div key={s.owner_id} className="border rounded-lg p-3">
              <p className="text-[13px] font-medium">{s.email}</p>
              <p className="text-[12px] text-neutral-500">
                {s.campaigns_created_count}/{s.campaign_limit}회 사용
                {s.trial_exhausted_at && " · 체험 소진됨"}
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                가입 {fmt(s.created_at)}
                {s.last_purchase_at && ` · 최근구매(${s.last_purchase_product_name}) ${fmt(s.last_purchase_at)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "history" && (
        <div className="flex flex-col gap-2">
          {history.length === 0 && (
            <p className="text-[13px] text-neutral-400 py-6 text-center">이력이 없습니다.</p>
          )}
          {history.map((h) => (
            <div key={h.id} className="border rounded-lg p-3">
              <p className="text-[13px] font-medium">{h.email}</p>
              <p className="text-[12px] text-neutral-500">
                {h.previous_limit ?? "-"} → {h.new_limit}회 {h.product_name && `(${h.product_name})`}
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{fmt(h.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
