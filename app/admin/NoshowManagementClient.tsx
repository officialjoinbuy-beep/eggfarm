"use client";

import { useEffect, useState } from "react";

type NoshowGroup = {
  phoneHash: string;
  activeCount: number;
  lastNickname: string;
  lastAt: string;
};

export default function NoshowManagementClient() {
  const [groups, setGroups] = useState<NoshowGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<NoshowGroup | null>(null);
  const [processing, setProcessing] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/noshow");
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmUnblock() {
    if (!target) return;
    setProcessing(true);
    await fetch(`/api/admin/noshow/${target.phoneHash}/exclude`, { method: "POST" });
    setProcessing(false);
    setTarget(null);
    load();
  }

  return (
    <div>
      <p className="text-[16px] font-semibold mb-1">노쇼 차단 관리</p>
      <p className="text-[12px] text-neutral-500 mb-4">
        같은 연락처로 2회 이상 노쇼가 기록되면 이후 현장픽업 주문이 자동으로 차단됩니다. 전화번호
        원본은 저장하지 않아, 마지막 노쇼 처리 시점의 닉네임으로 구분해서 보여드립니다.
      </p>

      {loading ? (
        <p className="text-center text-neutral-400 text-[13px] py-10">불러오는 중...</p>
      ) : groups.length === 0 ? (
        <p className="text-center text-neutral-400 text-[13px] py-10">
          현재 차단된 연락처가 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.phoneHash} className="border rounded-lg p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{g.lastNickname}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  노쇼 {g.activeCount}회 · 최근{" "}
                  {new Date(g.lastAt).toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => setTarget(g)}
                className="flex-shrink-0 text-[12px] border border-red-200 text-red-500 rounded px-3 py-1.5"
              >
                차단 해제
              </button>
            </div>
          ))}
        </div>
      )}

      {target && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
          <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl">
            <p className="text-[15px] font-medium mb-2">차단을 해제할까요?</p>
            <p className="text-[13px] text-neutral-500 mb-4">
              "{target.lastNickname}"(으)로 기록된 노쇼 {target.activeCount}건이 모두 제외 처리되어,
              이후 이 연락처로 다시 현장픽업 주문이 가능해집니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setTarget(null)} className="flex-1 border rounded-lg py-2 text-sm">
                취소
              </button>
              <button
                onClick={confirmUnblock}
                disabled={processing}
                className="flex-1 bg-neutral-900 text-white rounded-lg py-2 text-sm disabled:opacity-50"
              >
                {processing ? "처리 중..." : "차단 해제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
