"use client";

import { useState } from "react";
import { formatAccountNumber, formatNumberWithCommas, nextHour } from "@/lib/format";

type ProductInput = {
  name: string;
  price: string; // 콤마 포함 표시용 값
  stockLimit: string;
  maxPerPerson: string; // 인당 최대구매개수(선택, 비우면 제한없음)
  imageUrl: string;
  uploading: boolean;
};

const emptyProduct: ProductInput = {
  name: "",
  price: "",
  stockLimit: "",
  maxPerPerson: "",
  imageUrl: "",
  uploading: false,
};

export default function CampaignForm({
  onCreated,
  onCancel,
}: {
  onCreated: (campaignId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [products, setProducts] = useState<ProductInput[]>([{ ...emptyProduct }]);
  const [complexes, setComplexes] = useState<string[]>([""]);
  const [bankName, setBankName] = useState("");
  const [accountNumberDisplay, setAccountNumberDisplay] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [inquiryUrl, setInquiryUrl] = useState("");
  const [startDate, setStartDate] = useState(() => nextHour().date);
  const [startTime, setStartTime] = useState(() => nextHour().time);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateProduct(idx: number, field: keyof ProductInput, value: string | boolean) {
    setProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  }

  function addProduct() {
    if (products.length >= 3) return;
    setProducts((prev) => [...prev, { ...emptyProduct }]);
  }

  function updateComplex(idx: number, value: string) {
    setComplexes((prev) => prev.map((c, i) => (i === idx ? value : c)));
  }

  function addComplex() {
    setComplexes((prev) => [...prev, ""]);
  }

  function removeComplex(idx: number) {
    setComplexes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleImageSelect(idx: number, file: File | null) {
    if (!file) return;
    updateProduct(idx, "uploading", true);
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/admin/upload-product-image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    updateProduct(idx, "uploading", false);
    if (!res.ok) {
      setError(data.error || "이미지 업로드에 실패했습니다.");
      return;
    }
    updateProduct(idx, "imageUrl", data.url);
  }

  async function submit() {
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
    let closeDeadline: string | undefined;
    if (closeDate && closeTime) {
      closeDeadline = new Date(`${closeDate}T${closeTime}:00`).toISOString();
    } else if (closeDate || closeTime) {
      setError("마감 날짜와 시간을 모두 입력해주세요.");
      return;
    }

    let startAt: string | undefined;
    if (startDate && startTime) {
      startAt = new Date(`${startDate}T${startTime}:00`).toISOString();
    }
    if (startAt && closeDeadline && new Date(startAt) >= new Date(closeDeadline)) {
      setError("시작일시는 마감일시보다 이전이어야 합니다.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        bankName,
        accountNumber: accountNumberDisplay, // 서버에서 숫자만 추출해서 저장
        accountHolder,
        inquiryUrl,
        startAt,
        closeDeadline,
        complexes: validComplexes,
        products: products.map((p) => ({
          name: p.name,
          price: Number(p.price.replace(/[^0-9]/g, "")),
          stockLimit: Number(p.stockLimit),
          maxPerPerson: p.maxPerPerson ? Number(p.maxPerPerson) : null,
          imageUrl: p.imageUrl || undefined,
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
        placeholder="공구 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <p className="text-[12px] text-neutral-500 mb-1.5">
        시작일시 (기본값: 다음 정시 — 이 시각 전엔 주문접수 차단)
      </p>
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

      <p className="text-[12px] text-neutral-500 mb-1.5">마감일시 (선택 — 지나면 자동 마감)</p>
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

      <p className="text-[12px] text-neutral-500 mb-1.5">
        배송 가능한 아파트 단지 (등록된 단지만 주문 가능)
      </p>
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

      <p className="text-[12px] text-neutral-500 mb-1.5">상품 (최대 3개)</p>
      <div className="flex flex-col gap-2 mb-3">
        {products.map((p, idx) => (
          <div key={idx} className="border rounded-lg p-2.5">
            <div className="flex gap-2 mb-1.5">
              <label className="w-14 h-14 flex-shrink-0 border rounded overflow-hidden flex items-center justify-center bg-neutral-50 cursor-pointer relative">
                {p.uploading ? (
                  <span className="text-[10px] text-neutral-400">업로드중</span>
                ) : p.imageUrl ? (
                  <img src={p.imageUrl} alt="상품사진" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-neutral-400 text-center px-1">사진<br/>추가</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageSelect(idx, e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <input
                  className="w-full min-w-0 border rounded px-2 py-1.5 text-sm"
                  placeholder="상품명"
                  value={p.name}
                  onChange={(e) => updateProduct(idx, "name", e.target.value)}
                />
                <input
                  className="w-full min-w-0 border rounded px-2 py-1.5 text-sm"
                  placeholder="가격"
                  inputMode="numeric"
                  value={p.price}
                  onChange={(e) =>
                    updateProduct(idx, "price", formatNumberWithCommas(e.target.value))
                  }
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <input
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                placeholder="재고 상한 수량"
                inputMode="numeric"
                value={p.stockLimit}
                onChange={(e) =>
                  updateProduct(idx, "stockLimit", e.target.value.replace(/[^0-9]/g, ""))
                }
              />
              <input
                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                placeholder="인당 최대구매(선택)"
                inputMode="numeric"
                value={p.maxPerPerson}
                onChange={(e) =>
                  updateProduct(idx, "maxPerPerson", e.target.value.replace(/[^0-9]/g, ""))
                }
              />
            </div>
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
          placeholder="계좌번호 (숫자만 입력하면 자동으로 - 표시됨)"
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
