"use client";

import { useEffect, useState } from "react";
import { formatWon, formatNumberWithCommas } from "@/lib/format";

type Complex = { id: string; name: string };
type StaffLink = {
  id: string;
  token: string;
  complex_ids: string[];
  fee_per_order: number;
  expires_at: string;
  revoked: boolean;
};

export default function StaffLinkManager({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [complexes, setComplexes] = useState<Complex[]>([]);
  const [links, setLinks] = useState<StaffLink[]>([]);
  const [selectedComplexIds, setSelectedComplexIds] = useState<Set<string>>(new Set());
  const [fee, setFee] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    const [detailRes, linksRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaignId}`),
      fetch(`/api/admin/campaigns/${campaignId}/staff-links`),
    ]);
    if (detailRes.ok) {
      const data = await detailRes.json();
      setComplexes(data.complexes ?? []);
    }
    if (linksRes.ok) {
      const data = await linksRes.json();
      setLinks(data.links ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  function toggleComplex(id: string) {
    setSelectedComplexIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function createLink() {
    setError(null);
    if (selectedComplexIds.size === 0) {
      setError("담당할 단지를 1개 이상 선택해주세요.");
      return;
    }
    setCreating(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/staff-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complexIds: Array.from(selectedComplexIds),
        feePerOrder: Number(fee.replace(/[^0-9]/g, "")) || 0,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "링크 생성에 실패했습니다.");
      return;
    }
    setSelectedComplexIds(new Set());
    setFee("");
    load();
  }

  async function revokeLink(id: string) {
    if (!window.confirm("이 링크를 무효화할까요? 배송담당자는 더 이상 접근할 수 없게 됩니다.")) return;
    await fetch(`/api/admin/staff-links/${id}/revoke`, { method: "POST" });
    load();
  }

  function complexNames(ids: string[]) {
    return ids
      .map((id) => complexes.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  async function copyLink(link: StaffLink) {
    const url = `${window.location.origin}/staff/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto">
        <p className="text-[15px] font-medium mb-3">배송담당자 관리</p>

        {loading ? (
          <p className="text-center text-neutral-400 text-[13px] py-8">불러오는 중...</p>
        ) : (
          <>
            {complexes.length === 0 ? (
              <p className="text-[13px] text-neutral-400 mb-4">등록된 단지가 없습니다.</p>
            ) : (
              <>
                <p className="text-[12px] text-neutral-500 mb-1.5">담당할 단지 선택</p>
                <div className="flex flex-col gap-1.5 mb-3">
                  {complexes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={selectedComplexIds.has(c.id)}
                        onChange={() => toggleComplex(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <input
                  className="w-full border rounded px-3 py-2 text-sm mb-3"
                  placeholder="건당 배송비 (원)"
                  inputMode="numeric"
                  value={fee}
                  onChange={(e) => setFee(formatNumberWithCommas(e.target.value))}
                />
                {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
                <button
                  onClick={createLink}
                  disabled={creating}
                  className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium mb-4 disabled:opacity-50"
                >
                  {creating ? "생성 중..." : "링크 생성"}
                </button>
              </>
            )}

            <p className="text-[12px] text-neutral-500 mb-2">발급된 링크</p>
            <div className="flex flex-col gap-2 mb-4">
              {links.length === 0 && (
                <p className="text-[13px] text-neutral-400">발급된 링크가 없습니다.</p>
              )}
              {links.map((l) => {
                const expired = new Date(l.expires_at).getTime() < Date.now();
                return (
                  <div key={l.id} className="border rounded-lg p-2.5">
                    <p className="text-[13px] font-medium">{complexNames(l.complex_ids)}</p>
                    <p className="text-[12px] text-neutral-500">
                      건당 {formatWon(l.fee_per_order)} · 만료{" "}
                      {new Date(l.expires_at).toLocaleString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {(l.revoked || expired) && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {l.revoked ? "무효화됨" : "만료됨"}
                      </p>
                    )}
                    {!l.revoked && !expired && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => copyLink(l)}
                          className="flex-1 text-[12px] border rounded py-1.5"
                        >
                          {copiedId === l.id ? "복사됨" : "링크 복사"}
                        </button>
                        <button
                          onClick={() => revokeLink(l.id)}
                          className="flex-1 text-[12px] border border-red-200 text-red-500 rounded py-1.5"
                        >
                          무효화
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button onClick={onClose} className="w-full border rounded-lg py-2.5 text-sm">
          닫기
        </button>
      </div>
    </div>
  );
}
