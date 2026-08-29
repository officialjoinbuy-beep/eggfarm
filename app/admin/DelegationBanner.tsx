"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Delegation = {
  linkId: string;
  campaignId: string;
  campaignTitle: string;
  complexNames: string[];
  staff: { name: string; phone: string } | null;
  expiresAt: string;
};

export default function DelegationBanner() {
  const router = useRouter();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/delegations");
    if (res.ok) {
      const data = await res.json();
      setDelegations(data.delegations ?? []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(linkId: string) {
    if (!window.confirm("이 위임배송 링크를 무효화할까요?")) return;
    setRevokingId(linkId);
    await fetch(`/api/admin/staff-links/${linkId}/revoke`, { method: "POST" });
    setRevokingId(null);
    load();
  }

  if (delegations.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between bg-blue-50 rounded-lg px-3.5 py-2.5"
      >
        <span className="text-[13px] text-blue-700">
          🚚 현재 위임 중 {delegations.length}건
        </span>
        <span className="text-[12px] text-blue-600">{expanded ? "접기 ←" : "자세히 →"}</span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 mt-2">
          {delegations.map((d) => (
            <div key={d.linkId} className="border rounded-lg p-3">
              <button
                onClick={() => router.push(`/admin/${d.campaignId}`)}
                className="text-left w-full"
              >
                <p className="text-[13px] font-medium">{d.campaignTitle}</p>
                <p className="text-[12px] text-neutral-500 mt-0.5">
                  {d.complexNames.join(", ") || "단지 정보 없음"}
                  {d.staff && ` · ${d.staff.name} (${d.staff.phone})`}
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  만료{" "}
                  {new Date(d.expiresAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
              <button
                onClick={() => revoke(d.linkId)}
                disabled={revokingId === d.linkId}
                className="mt-2 w-full text-[11px] border border-red-200 text-red-500 rounded py-1.5 disabled:opacity-50"
              >
                무효화
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
