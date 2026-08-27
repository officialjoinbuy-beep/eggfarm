"use client";

import { useEffect, useState } from "react";
import { formatAccountNumber } from "@/lib/format";

type CampaignDetail = {
  id: string;
  title: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  inquiry_url: string | null;
  close_deadline: string | null;
  start_at: string | null;
};

export default function EditCampaignModal({
  campaignId,
  onClose,
  onSaved,
}: {
  campaignId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumberDisplay, setAccountNumberDisplay] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [inquiryUrl, setInquiryUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [complexes, setComplexes] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        const c: CampaignDetail = data.campaign;
        setTitle(c.title);
        setBankName(c.bank_name);
        setAccountNumberDisplay(formatAccountNumber(c.account_number));
        setAccountHolder(c.account_holder);
        setInquiryUrl(c.inquiry_url || "");
        if (c.start_at) {
          const sd = new Date(c.start_at);
          setStartDate(sd.toISOString().slice(0, 10));
          setStartTime(sd.toTimeString().slice(0, 5));
        }
        if (c.close_deadline) {
          const d = new Date(c.close_deadline);
          setCloseDate(d.toISOString().slice(0, 10));
          setCloseTime(d.toTimeString().slice(0, 5));
        }
        const names: string[] = (data.complexes || []).map((x: { name: string }) => x.name);
        setComplexes(names.length > 0 ? names : [""]);
      }
      setLoading(false);
    }
    load();
  }, [campaignId]);

  function updateComplex(idx: number, value: string) {
    setComplexes((prev) => prev.map((c, i) => (i === idx ? value : c)));
  }
  function addComplex() {
    setComplexes((prev) => [...prev, ""]);
  }
  function removeComplex(idx: number) {
    setComplexes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setError(null);
    if (!title || !bankName || !accountNumberDisplay || !accountHolder) {
      setError("필수 항목을 입력해주세요.");
      return;
    }
    const validComplexes = complexes.map((c) => c.trim()).filter(Boolean);
    if (validComplexes.length === 0) {
      setError("배송 가능한 아파트 단지를 1개 이상 등록해주세요.");
      return;
    }
    let closeDeadline: string | null = null;
    if (closeDate && closeTime) {
      closeDeadline = new Date(`${closeDate}T${closeTime}:00`).toISOString();
    } else if (closeDate || closeTime) {
      setError("마감 날짜와 시간을 모두 입력해주세요.");
      return;
    }

    let startAt: string | null = null;
    if (startDate && startTime) {
      startAt = new Date(`${startDate}T${startTime}:00`).toISOString();
    } else if (startDate || startTime) {
      setError("시작 날짜와 시간을 모두 입력해주세요.");
      return;
    }
    if (startAt && closeDeadline && new Date(startAt) >= new Date(closeDeadline)) {
      setError("시작일시는 마감일시보다 이전이어야 합니다.");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        bankName,
        accountNumber: accountNumberDisplay,
        accountHolder,
        inquiryUrl,
        startAt,
        closeDeadline,
        complexes: validComplexes,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "수정에 실패했습니다.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto">
        <p className="text-[15px] font-medium mb-3">공구 정보 수정</p>

        {loading ? (
          <p className="text-center text-neutral-400 text-[13px] py-8">불러오는 중...</p>
        ) : (
          <>
            <input
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              placeholder="공구 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <p className="text-[12px] text-neutral-500 mb-1.5">시작일시 (선택)</p>
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <input
                type="time"
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <p className="text-[12px] text-neutral-500 mb-1.5">마감일시 (선택)</p>
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
              <input
                type="time"
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>

            <p className="text-[12px] text-neutral-500 mb-1.5">배송 가능한 아파트 단지</p>
            <div className="flex flex-col gap-2 mb-3">
              {complexes.map((c, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                    placeholder="아파트 단지명"
                    value={c}
                    onChange={(e) => updateComplex(idx, e.target.value)}
                  />
                  {complexes.length > 1 && (
                    <button
                      onClick={() => removeComplex(idx)}
                      className="flex-shrink-0 w-8 border rounded text-neutral-400"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addComplex}
                className="border border-dashed rounded-lg py-2 text-center text-neutral-500 text-[13px]"
              >
                + 단지 추가
              </button>
            </div>

            <p className="text-[12px] text-neutral-500 mb-1.5">입금 계좌</p>
            <div className="flex flex-col gap-2 mb-3">
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="은행명"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="계좌번호"
                inputMode="numeric"
                value={accountNumberDisplay}
                onChange={(e) => setAccountNumberDisplay(formatAccountNumber(e.target.value))}
              />
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="예금주"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>

            <p className="text-[12px] text-neutral-500 mb-1.5">문의 연결</p>
            <input
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              placeholder="오픈채팅 1:1 문의 링크"
              value={inquiryUrl}
              onChange={(e) => setInquiryUrl(e.target.value)}
            />

            {error && <p className="text-[13px] text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 border rounded-lg py-2.5 text-sm">
                취소
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
