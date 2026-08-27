"use client";

import { useState } from "react";

type ProductInput = { name: string; price: string; stockLimit: string };

export default function CampaignForm({
  onCreated,
  onCancel,
}: {
  onCreated: (campaignId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [products, setProducts] = useState<ProductInput[]>([
    { name: "", price: "", stockLimit: "" },
  ]);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [inquiryUrl, setInquiryUrl] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateProduct(idx: number, field: keyof ProductInput, value: string) {
    setProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  }

  function addProduct() {
    if (products.length >= 3) return;
    setProducts((prev) => [...prev, { name: "", price: "", stockLimit: "" }]);
  }

  async function submit() {
    setError(null);
    if (!title || !bankName || !accountNumber || !accountHolder) {
      setError("필수 항목을 입력해주세요.");
      return;
    }
    let closeDeadline: string | undefined;
    if (closeDate && closeTime) {
      closeDeadline = new Date(`${closeDate}T${closeTime}:00`).toISOString();
    } else if (closeDate || closeTime) {
      setError("마감 날짜와 시간을 모두 입력해주세요.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        bankName,
        accountNumber,
        accountHolder,
        inquiryUrl,
        closeDeadline,
        products: products.map((p) => ({
          name: p.name,
          price: Number(p.price),
          stockLimit: Number(p.stockLimit),
        })),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "공구 생성에 실패했습니다.");
      return;
    }
    onCreated(data.campaignId);
  }

  return (
    <div className="border rounded-lg p-3.5 bg-white">
      <p className="text-[13px] font-medium mb-3">새 공구 만들기</p>

      <input
        className="w-full border rounded px-3 py-2 text-sm mb-3"
        placeholder="공구 제목 (예: 8월 셋째주 앨범 공구)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <p className="text-[12px] text-neutral-500 mb-1.5">마감일시 (선택 — 지나면 자동 마감)</p>
      <div className="flex gap-2 mb-3">
        <input
          type="date"
          className="flex-1 border rounded px-2 py-1.5 text-sm"
          value={closeDate}
          onChange={(e) => setCloseDate(e.target.value)}
        />
        <input
          type="time"
          className="flex-1 border rounded px-2 py-1.5 text-sm"
          value={closeTime}
          onChange={(e) => setCloseTime(e.target.value)}
        />
      </div>

      <p className="text-[12px] text-neutral-500 mb-1.5">상품 (최대 3개)</p>
      <div className="flex flex-col gap-2 mb-3">
        {products.map((p, idx) => (
          <div key={idx} className="border rounded-lg p-2.5">
            <div className="flex gap-2 mb-1.5">
              <input
                className="flex-[2] border rounded px-2 py-1.5 text-sm"
                placeholder="상품명"
                value={p.name}
                onChange={(e) => updateProduct(idx, "name", e.target.value)}
              />
              <input
                className="flex-1 border rounded px-2 py-1.5 text-sm"
                placeholder="가격"
                inputMode="numeric"
                value={p.price}
                onChange={(e) =>
                  updateProduct(idx, "price", e.target.value.replace(/[^0-9]/g, ""))
                }
              />
            </div>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="재고 상한 수량"
              inputMode="numeric"
              value={p.stockLimit}
              onChange={(e) =>
                updateProduct(idx, "stockLimit", e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </div>
        ))}
        {products.length < 3 && (
          <button
            onClick={addProduct}
            className="border border-dashed rounded-lg p-2.5 text-center text-neutral-500 text-[13px]"
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
          placeholder="계좌번호 (- 없이)"
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
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
        <button
          onClick={onCancel}
          className="flex-1 border rounded-lg py-2.5 text-sm"
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "생성 중..." : "만들기"}
        </button>
      </div>
    </div>
  );
}
