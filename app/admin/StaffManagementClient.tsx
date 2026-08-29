"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatWon } from "@/lib/format";

type StaffPerson = {
  id: string;
  name: string;
  phone: string;
  retention_expires_at: string;
  created_at: string;
};
type Settlement = {
  id: string;
  name: string;
  phone: string;
  completedCount: number;
  settlementAmount: number;
};
type BlockedCampaign = { campaignId: string; campaignTitle: string; complexNames: string[] };

function isRetentionPromptWindow() {
  const now = new Date();
  return now.getMonth() === 11 && now.getDate() >= 20; // 12월 20일~31일 사이 안내
}

export default function StaffManagementClient() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffPerson[]>([]);
  const [reveal, setReveal] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [blockedCampaigns, setBlockedCampaigns] = useState<BlockedCampaign[] | null>(null);

  async function load() {
    const [staffRes, settleRes] = await Promise.all([
      fetch(`/api/admin/staff${reveal ? "?reveal=1" : ""}`),
      fetch(`/api/admin/staff/settlement`),
    ]);
    if (staffRes.ok) {
      const data = await staffRes.json();
      setStaff(data.staff ?? []);
    }
    if (settleRes.ok) {
      const data = await settleRes.json();
      setSettlements(data.settlements ?? []);
    }
    const now = new Date();
    setMonthLabel(`${now.getFullYear()}년 ${now.getMonth() + 1}월`);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  async function renew(id: string) {
    await fetch(`/api/admin/staff/${id}/renew`, { method: "POST" });
    load();
  }

  async function removeStaff(id: string) {
    if (!window.confirm("이 배송담당자 정보를 완전히 삭제할까요? 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.campaigns && data.campaigns.length > 0) {
        setBlockedCampaigns(data.campaigns);
        return;
      }
      alert(data.error || "삭제에 실패했습니다.");
      return;
    }
    load();
  }

  const needsRetentionPrompt = isRetentionPromptWindow() && staff.length > 0;

  return (
    <div>
      <p className="text-[16px] font-semibold mb-3">배송담당자 관리</p>

      {needsRetentionPrompt && (
        <div className="bg-amber-50 rounded-lg p-3 mb-4">
          <p className="text-[13px] text-amber-700 mb-1">
            연말 보유기간 확인 안내 — 12/31까지 응답이 없으면 자동으로 1년 연장됩니다.
          </p>
          <p className="text-[12px] text-amber-600">
            더 이상 필요없는 담당자는 아래 목록에서 직접 삭제해주세요.
          </p>
        </div>
      )}

      <div className="bg-neutral-50 border rounded-xl p-4 mb-4">
        <p className="text-[13px] text-neutral-500 mb-2">{monthLabel} 정산 현황</p>
        {loading ? (
          <p className="text-[13px] text-neutral-400">불러오는 중...</p>
        ) : settlements.length === 0 ? (
          <p className="text-[13px] text-neutral-400">등록된 배송담당자가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">{s.name}</p>
                  <p className="text-[11px] text-neutral-400">{s.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-medium">{formatWon(s.settlementAmount)}</p>
                  <p className="text-[11px] text-neutral-400">완료 {s.completedCount}건</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] text-neutral-500">배송담당자 목록</p>
        <button onClick={() => setReveal((v) => !v)} className="text-[11px] underline text-neutral-500">
          {reveal ? "가리기" : "전체보기"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {staff.length === 0 && (
          <p className="text-[13px] text-neutral-400 py-4">
            등록된 배송담당자가 없습니다. 공구 마감 후 "위임배송 등록"에서 새로 등록할 수 있습니다.
          </p>
        )}
        {staff.map((s) => (
          <div key={s.id} className="border rounded-lg p-3">
            <p className="text-[13px] font-medium">{s.name}</p>
            <p className="text-[12px] text-neutral-500">{s.phone}</p>
            <p className="text-[11px] text-neutral-400 mt-1">
              보유기한:{" "}
              {new Date(s.retention_expires_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => renew(s.id)} className="flex-1 text-[12px] border rounded py-1.5">
                1년 연장
              </button>
              <button
                onClick={() => removeStaff(s.id)}
                className="flex-1 text-[12px] border border-red-200 text-red-500 rounded py-1.5"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      {blockedCampaigns && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
          <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl">
            <p className="text-[15px] font-medium mb-2">삭제할 수 없어요</p>
            <p className="text-[13px] text-neutral-500 mb-3">
              아래 공구에 살아있는 위임배송 링크가 있습니다. 먼저 무효화해주세요.
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {blockedCampaigns.map((c) => (
                <button
                  key={c.campaignId}
                  onClick={() => router.push(`/admin/${c.campaignId}`)}
                  className="text-left border rounded-lg p-2.5 hover:bg-neutral-50"
                >
                  <p className="text-[13px] font-medium">{c.campaignTitle}</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {c.complexNames.join(", ") || "단지 정보 없음"} · 바로가기 →
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setBlockedCampaigns(null)}
              className="w-full border rounded-lg py-2 text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
