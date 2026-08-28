"use client";

import { useEffect, useState } from "react";
import { formatAccountNumber, formatNumberWithCommas } from "@/lib/format";

type CampaignDetail = {
  id: string;
  title: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  inquiry_url: string | null;
  close_deadline: string | null;
  start_at: string | null;
  fulfillment_mode: "pickup_only" | "delivery_only" | "hybrid";
};

type ProductDetail = {
  id: string;
  name: string;
  price: number;
  stock_limit: number;
  stock_reserved: number;
  max_per_person: number | null;
  is_active: boolean;
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
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup_only" | "delivery_only" | "hybrid">(
    "hybrid"
  );
  const [products, setProducts] = useState<
    {
      id: string; // 신규 추가 상품은 빈 문자열
      name: string;
      price: string;
      stockLimit: string;
      maxPerPerson: string;
      stockReserved: number;
      isActive: boolean;
    }[]
  >([]);
  const [deletedProductIds, setDeletedProductIds] = useState<string[]>([]);
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
        setFulfillmentMode(c.fulfillment_mode || "hybrid");
        const p: ProductDetail[] = data.products || [];
        setProducts(
          p.map((x) => ({
            id: x.id,
            name: x.name,
            price: formatNumberWithCommas(String(x.price)),
            stockLimit: String(x.stock_limit),
            maxPerPerson: x.max_per_person != null ? String(x.max_per_person) : "",
            stockReserved: x.stock_reserved,
            isActive: x.is_active,
          }))
        );
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
  function updateProduct(
    idx: number,
    field: "name" | "price" | "stockLimit" | "maxPerPerson",
    value: string
  ) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }
  function toggleProductActive(idx: number) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, isActive: !p.isActive } : p)));
  }
  function addProduct() {
    if (products.length >= 3) return;
    setProducts((prev) => [
      ...prev,
      { id: "", name: "", price: "", stockLimit: "", maxPerPerson: "", stockReserved: 0, isActive: true },
    ]);
  }
  function removeProduct(idx: number) {
    const p = products[idx];
    if (p.stockReserved > 0) return; // 주문 이력 있는 상품은 삭제 불가(방어적으로 한 번 더 체크)
    if (p.id) setDeletedProductIds((prev) => [...prev, p.id]);
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setError(null);
    if (!title || !bankName || !accountNumberDisplay || !accountHolder) {
      setError("필수 항목을 입력해주세요.");
      return;
    }
    const validComplexes = complexes.map((c) => c.trim()).filter(Boolean);
    if (fulfillmentMode !== "pickup_only" && validComplexes.length === 0) {
      setError("배송 가능한 아파트 단지를 1개 이상 등록해주세요.");
      return;
    }
    if (products.length === 0) {
      setError("상품을 1개 이상 등록해주세요.");
      return;
    }
    for (const p of products) {
      const limit = Number(p.stockLimit);
      if (limit < p.stockReserved) {
        setError(`"${p.name}" 재고상한은 이미 예약된 수량(${p.stockReserved}개)보다 적게 설정할 수 없습니다.`);
        return;
      }
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
        products: products.map((p) => ({
          id: p.id || undefined,
          name: p.name,
          price: Number(p.price.replace(/[^0-9]/g, "")),
          stockLimit: Number(p.stockLimit),
          maxPerPerson: p.maxPerPerson ? Number(p.maxPerPerson) : null,
          isActive: p.isActive,
        })),
        deletedProductIds,
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
            {fulfillmentMode === "pickup_only" ? (
              <p className="text-[12px] text-neutral-400 mb-3">픽업전용 공구는 단지 등록이 필요 없습니다.</p>
            ) : (
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
            )}

            <p className="text-[12px] text-neutral-500 mb-1.5">상품 정보 수정</p>
            <div className="flex flex-col gap-2 mb-3">
              {products.map((p, idx) => (
                <div key={idx} className="border rounded-lg p-2.5">
                  <input
                    className="w-full border rounded px-2 py-1.5 text-sm mb-1.5"
                    placeholder="상품명"
                    value={p.name}
                    onChange={(e) => updateProduct(idx, "name", e.target.value)}
                  />
                  <div className="flex gap-1.5 mb-1.5">
                    <input
                      className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                      placeholder="가격"
                      inputMode="numeric"
                      value={p.price}
                      onChange={(e) => updateProduct(idx, "price", formatNumberWithCommas(e.target.value))}
                    />
                    <input
                      className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                      placeholder="재고상한"
                      inputMode="numeric"
                      value={p.stockLimit}
                      onChange={(e) =>
                        updateProduct(idx, "stockLimit", e.target.value.replace(/[^0-9]/g, ""))
                      }
                    />
                  </div>
                  <input
                    className="w-full min-w-0 border rounded px-2 py-1.5 text-sm mb-1.5"
                    placeholder="인당 최대구매(선택)"
                    inputMode="numeric"
                    value={p.maxPerPerson}
                    onChange={(e) =>
                      updateProduct(idx, "maxPerPerson", e.target.value.replace(/[^0-9]/g, ""))
                    }
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-neutral-400">
                      {p.id ? `주문된 수량: ${p.stockReserved}개` : "신규 상품"}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleProductActive(idx)}
                        className={`text-[11px] border rounded px-2 py-1 ${
                          p.isActive ? "text-neutral-500" : "text-amber-600 border-amber-300"
                        }`}
                      >
                        {p.isActive ? "판매중지" : "판매중지됨 (해제)"}
                      </button>
                      {p.stockReserved === 0 && (
                        <button
                          onClick={() => removeProduct(idx)}
                          className="text-[11px] border border-red-200 text-red-500 rounded px-2 py-1"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {products.length < 3 && (
                <button
                  onClick={addProduct}
                  className="border border-dashed rounded-lg py-2 text-center text-neutral-500 text-[13px]"
                >
                  + 상품 추가
                </button>
              )}
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
