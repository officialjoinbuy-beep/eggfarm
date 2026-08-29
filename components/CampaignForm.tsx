"use client";

import { useState } from "react";
import { formatAccountNumber, formatNumberWithCommas, formatPickupTimeNote, next15Min } from "@/lib/format";
import Spinner from "@/components/Spinner";
import TimeSelect from "@/components/TimeSelect";

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

// 완료된 공구를 "재생성"할 때 넘겨주는 값 - 시작/마감일시는 항상 새로 입력받아야
// 하므로 여기 포함하지 않는다.
export type CampaignPrefill = {
  title: string;
  bankName: string;
  accountNumber: string; // 표시용(하이픈 포함 가능)
  accountHolder: string;
  inquiryUrl: string;
  complexes: string[];
  fulfillmentMode: "pickup_only" | "delivery_only" | "hybrid";
  deliveryFee: number;
  products: {
    name: string;
    price: string;
    stockLimit: string;
    maxPerPerson: string;
    imageUrl: string;
  }[];
};

const MODE_OPTIONS: { value: "pickup_only" | "delivery_only" | "hybrid"; label: string }[] = [
  { value: "pickup_only", label: "🏢 픽업전용" },
  { value: "delivery_only", label: "🚚 배송전용" },
  { value: "hybrid", label: "🏢🚚 픽업or배송" },
];

export default function CampaignForm({
  onCreated,
  onCancel,
  onLimitReached,
  prefill,
}: {
  onCreated: (campaignId: string) => void;
  onCancel: () => void;
  onLimitReached?: (supportChatUrl: string | null) => void;
  prefill?: CampaignPrefill;
}) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup_only" | "delivery_only" | "hybrid">(
    prefill?.fulfillmentMode ?? "hybrid"
  );
  const [deliveryFee, setDeliveryFee] = useState(
    prefill?.deliveryFee ? formatNumberWithCommas(String(prefill.deliveryFee)) : ""
  );
  const [products, setProducts] = useState<ProductInput[]>(
    prefill && prefill.products.length > 0
      ? prefill.products.map((p) => ({ ...p, uploading: false }))
      : [{ ...emptyProduct }]
  );
  const [complexes, setComplexes] = useState<string[]>(
    prefill && prefill.complexes.length > 0 ? prefill.complexes : [""]
  );
  const [bankName, setBankName] = useState(prefill?.bankName ?? "");
  const [accountNumberDisplay, setAccountNumberDisplay] = useState(
    prefill ? formatAccountNumber(prefill.accountNumber) : ""
  );
  const [accountHolder, setAccountHolder] = useState(prefill?.accountHolder ?? "");
  const [inquiryUrl, setInquiryUrl] = useState(prefill?.inquiryUrl ?? "");
  const [startDate, setStartDate] = useState(() => next15Min().date);
  const [startTime, setStartTime] = useState(() => next15Min().time);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [pickupExpectedDate, setPickupExpectedDate] = useState("");
  const [pickupFromTime, setPickupFromTime] = useState("");
  const [pickupToTime, setPickupToTime] = useState("");
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
    if (fulfillmentMode !== "pickup_only" && validComplexes.length === 0) {
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
        pickupExpectedDate: fulfillmentMode !== "delivery_only" ? pickupExpectedDate || undefined : undefined,
        pickupExpectedTimeNote:
          fulfillmentMode !== "delivery_only"
            ? formatPickupTimeNote(pickupFromTime, pickupToTime) || undefined
            : undefined,
        fulfillmentMode,
        deliveryFee: fulfillmentMode === "pickup_only" ? 0 : Number(deliveryFee.replace(/[^0-9]/g, "")) || 0,
        complexes: fulfillmentMode === "pickup_only" ? [] : validComplexes,
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
      if (data.code === "CAMPAIGN_LIMIT_REACHED" && onLimitReached) {
        onLimitReached(data.supportChatUrl ?? null);
        return;
      }
      setError(data.error || "공구 생성에 실패했습니다.");
      return;
    }
    onCreated(data.campaignId);
  }

  return (
    <div className="border rounded-lg p-3.5 bg-white">
      <p className="text-[13px] font-medium mb-3">
        {prefill ? "이전 공구 조건으로 새 공구 만들기" : "새 공구 만들기"}
      </p>
      {prefill && (
        <p className="text-[11px] text-neutral-400 -mt-2 mb-3">
          상품/단지/계좌 정보는 그대로 불러왔습니다. 시작·마감일시는 새로 입력해주세요.
        </p>
      )}

      <input
        className="w-full border rounded px-3 py-2 text-sm mb-3"
        placeholder="공구 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <p className="text-[12px] text-neutral-500 mb-1.5">
        시작일시 (기본값: 다음 15분 단위 — 이 시각 전엔 주문접수 차단)
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="date"
          className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <TimeSelect className="flex-1" value={startTime} onChange={setStartTime} />
      </div>

      <p className="text-[12px] text-neutral-500 mb-1.5">마감일시 (선택 — 지나면 자동 마감)</p>
      <div className="flex gap-2 mb-3">
        <input
          type="date"
          className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
          value={closeDate}
          onChange={(e) => setCloseDate(e.target.value)}
        />
        <TimeSelect className="flex-1" value={closeTime} onChange={setCloseTime} />
      </div>

      {fulfillmentMode !== "delivery_only" && (
        <>
          <p className="text-[12px] text-neutral-500 mb-1.5">
            예상 현장수령일 (선택 — 구매자에게 안내됩니다)
          </p>
          <div className="flex gap-2 mb-1.5">
            <input
              type="date"
              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
              value={pickupExpectedDate}
              onChange={(e) => setPickupExpectedDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <TimeSelect className="flex-1" value={pickupFromTime} onChange={setPickupFromTime} />
            <span className="text-[12px] text-neutral-400 flex-shrink-0">~</span>
            <TimeSelect className="flex-1" value={pickupToTime} onChange={setPickupToTime} />
          </div>
          <p className="text-[11px] text-neutral-400 mb-3">
            입고 상황에 따라 일정이 변동될 수 있다는 안내가 구매자 화면에 자동으로 함께 표시됩니다.
          </p>
        </>
      )}

      <p className="text-[12px] text-neutral-500 mb-1.5">수령방식 (생성 후 변경 불가)</p>
      <div className="flex gap-1.5 mb-3">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFulfillmentMode(opt.value)}
            className={`flex-1 border rounded-lg py-2 text-[12px] ${
              fulfillmentMode === opt.value ? "bg-neutral-900 text-white" : "text-neutral-500"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {fulfillmentMode !== "pickup_only" && (
        <>
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

          <p className="text-[12px] text-neutral-500 mb-1.5">
            문앞배송 배송비 (구매자 부담, 1건당 고정금액 - 기본 0원)
          </p>
          <input
            className="w-full border rounded px-3 py-2 text-sm mb-3"
            placeholder="배송비"
            inputMode="numeric"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(formatNumberWithCommas(e.target.value))}
          />
        </>
      )}

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
          className="flex-1 bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center"
        >
          {submitting && <Spinner />}
          {submitting ? "생성 중..." : "만들기"}
        </button>
      </div>
    </div>
  );
}
