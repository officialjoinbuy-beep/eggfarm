"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWon, formatNumberWithCommas, formatPhone } from "@/lib/format";
import { matchesKoreanName } from "@/lib/korean-search";

type Complex = { id: string; name: string };
type StaffLink = {
  id: string;
  token: string;
  complex_ids: string[];
  fee_per_order: number;
  expires_at: string;
  revoked: boolean;
  staff_id: string | null;
};
type StaffPerson = { id: string; name: string; phone: string; lastFeePerOrder: number | null };

export default function StaffLinkManager({
  campaignId,
  onClose,
  onChanged,
}: {
  campaignId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [complexes, setComplexes] = useState<Complex[]>([]);
  const [links, setLinks] = useState<StaffLink[]>([]);
  const [staffList, setStaffList] = useState<StaffPerson[]>([]);
  const [selectedComplexIds, setSelectedComplexIds] = useState<Set<string>>(new Set());
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSearchFocused, setStaffSearchFocused] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [fee, setFee] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<StaffLink | null>(null);

  async function load() {
    const [detailRes, linksRes, staffRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaignId}`),
      fetch(`/api/admin/campaigns/${campaignId}/staff-links`),
      // reveal=1: 담당자 검색(초성/오타)이 실제 이름 기준으로 동작하려면
      // 마스킹되지 않은 이름이 필요하다. 이 화면은 진행자 본인만 보는 영역.
      fetch(`/api/admin/staff?reveal=1`),
    ]);
    if (detailRes.ok) {
      const data = await detailRes.json();
      setComplexes(data.complexes ?? []);
    }
    if (linksRes.ok) {
      const data = await linksRes.json();
      setLinks(data.links ?? []);
    }
    if (staffRes.ok) {
      const data = await staffRes.json();
      setStaffList(data.staff ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // 이미 살아있는(무효화 안됐고 만료 안된) 링크가 담당 중인 단지는 새 링크
  // 생성 대상에서 제외한다 - 같은 단지에 링크가 중복 생성되는 걸 화면에서부터 막음.
  const occupiedComplexIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const l of links) {
      if (l.revoked) continue;
      if (new Date(l.expires_at).getTime() < now) continue;
      for (const cid of l.complex_ids) ids.add(cid);
    }
    return ids;
  }, [links]);

  const staffMatches = useMemo(() => {
    const q = staffSearch.trim();
    if (!q) return staffList;
    return staffList.filter((s) => matchesKoreanName(s.name, q));
  }, [staffList, staffSearch]);

  const selectedStaff = staffList.find((s) => s.id === selectedStaffId) || null;

  function toggleComplex(id: string) {
    if (occupiedComplexIds.has(id)) return;
    setSelectedComplexIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function pickStaff(s: StaffPerson) {
    setSelectedStaffId(s.id);
    setStaffSearch(s.name);
    setStaffSearchFocused(false);
    if (s.lastFeePerOrder != null) {
      setFee(formatNumberWithCommas(String(s.lastFeePerOrder)));
    }
  }

  function clearStaffSelection() {
    setSelectedStaffId("");
    setStaffSearch("");
  }

  async function createLink() {
    setError(null);
    if (selectedComplexIds.size === 0) {
      setError("담당할 단지를 1개 이상 선택해주세요.");
      return;
    }

    let staffId = selectedStaffId;
    if (!staffId) {
      if (!newStaffName.trim() || !newStaffPhone.trim()) {
        setError("배송담당자 이름과 연락처를 입력하거나, 등록된 담당자를 선택해주세요.");
        return;
      }
      const staffRes = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStaffName.trim(), phone: newStaffPhone.trim() }),
      });
      const staffData = await staffRes.json();
      if (!staffRes.ok) {
        setError(staffData.error || "담당자 등록에 실패했습니다.");
        return;
      }
      staffId = staffData.id;
    }

    setCreating(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/staff-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complexIds: Array.from(selectedComplexIds),
        feePerOrder: Number(fee.replace(/[^0-9]/g, "")) || 0,
        staffId,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "링크 생성에 실패했습니다.");
      return;
    }
    setSelectedComplexIds(new Set());
    setSelectedStaffId("");
    setStaffSearch("");
    setNewStaffName("");
    setNewStaffPhone("");
    setFee("");
    load();
    onChanged?.();
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    await fetch(`/api/admin/staff-links/${revokeTarget.id}/revoke`, { method: "POST" });
    setRevokeTarget(null);
    load();
    onChanged?.();
  }

  function complexNames(ids: string[]) {
    return ids
      .map((id) => complexes.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  function staffLabel(staffId: string | null) {
    const s = staffList.find((x) => x.id === staffId);
    return s ? `${s.name} (${s.phone})` : "담당자 정보 없음";
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
        <p className="text-[15px] font-medium mb-3">위임배송 등록</p>

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
                  {complexes.map((c) => {
                    const occupied = occupiedComplexIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 text-[13px] ${
                          occupied ? "text-neutral-300" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedComplexIds.has(c.id)}
                          onChange={() => toggleComplex(c.id)}
                          disabled={occupied}
                        />
                        {c.name}
                        {occupied && (
                          <span className="text-[11px] text-neutral-300">(이미 위임됨)</span>
                        )}
                      </label>
                    );
                  })}
                </div>

                <p className="text-[12px] text-neutral-500 mb-1.5">배송담당자</p>
                {selectedStaff ? (
                  <div className="flex items-center justify-between border rounded px-3 py-2 text-sm bg-neutral-50 mb-2">
                    <span>
                      {selectedStaff.name} ({selectedStaff.phone})
                    </span>
                    <button
                      onClick={clearStaffSelection}
                      className="text-[11px] text-neutral-400 underline flex-shrink-0 ml-2"
                    >
                      변경
                    </button>
                  </div>
                ) : (
                  <div className="relative mb-2">
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      placeholder="담당자 검색 (이름, 초성, 영타 모두 가능)"
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      onFocus={() => setStaffSearchFocused(true)}
                      onBlur={() => setTimeout(() => setStaffSearchFocused(false), 150)}
                    />
                    {staffSearchFocused && staffList.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 border rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto z-10">
                        {staffMatches.length === 0 ? (
                          <p className="text-[12px] text-neutral-400 px-3 py-2">
                            일치하는 담당자가 없습니다.
                          </p>
                        ) : (
                          staffMatches.map((s) => (
                            <button
                              key={s.id}
                              onMouseDown={() => pickStaff(s)}
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-neutral-50"
                            >
                              {s.name} <span className="text-neutral-400">({s.phone})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!selectedStaffId && (
                  <div className="flex gap-2 mb-3">
                    <input
                      className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                      placeholder="새 담당자 이름"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                    />
                    <input
                      className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                      placeholder="연락처"
                      inputMode="numeric"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(formatPhone(e.target.value))}
                      maxLength={13}
                    />
                  </div>
                )}

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
                    <p className="text-[12px] text-neutral-500">{staffLabel(l.staff_id)}</p>
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
                          onClick={() => setRevokeTarget(l)}
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

      {revokeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-[60]">
          <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl">
            <p className="text-[15px] font-medium mb-2">링크를 무효화할까요?</p>
            <p className="text-[13px] text-neutral-500 mb-4">
              "{complexNames(revokeTarget.complex_ids)}" 담당 링크가 즉시 접근 불가능해집니다.
              배송담당자는 더 이상 이 링크로 들어올 수 없게 되며, 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRevokeTarget(null)}
                className="flex-1 border rounded-lg py-2 text-sm"
              >
                취소
              </button>
              <button
                onClick={confirmRevoke}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm"
              >
                무효화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
