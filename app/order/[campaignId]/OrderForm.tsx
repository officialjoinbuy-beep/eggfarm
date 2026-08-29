"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPhone, formatWon, normalizePhone } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  price: number;
  stock_limit: number;
  stock_reserved: number;
  max_per_person: number | null;
  image_url?: string | null;
};

type Complex = { id: string; name: string };

export default function OrderForm({
  campaignId,
  title,
  products,
  complexes,
  fulfillmentMode,
  deliveryFee,
  pickupExpectedDate,
  pickupExpectedTimeNote,
}: {
  campaignId: string;
  title: string;
  products: Product[];
  complexes: Complex[];
  fulfillmentMode: "pickup_only" | "delivery_only" | "hybrid";
  deliveryFee: number;
  pickupExpectedDate?: string | null;
  pickupExpectedTimeNote?: string | null;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(products.map((p) => [p.id, 0]))
  );
  const [nickname, setNickname] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [pin, setPin] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"배송" | "픽업">(
    fulfillmentMode === "pickup_only" ? "픽업" : complexes.length > 0 ? "배송" : "픽업"
  );
  const [paymentMethod, setPaymentMethod] = useState<"계좌이체" | "현장결제">("계좌이체");
  const [complexId, setComplexId] = useState(complexes[0]?.id ?? "");
  const [dong, setDong] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [entryPassword, setEntryPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const productTotal = useMemo(
    () =>
      products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.price, 0),
    [quantities, products]
  );
  const appliedDeliveryFee = fulfillmentType === "배송" ? deliveryFee : 0;
  const total = productTotal + appliedDeliveryFee;

  function remaining(p: Product) {
    return p.stock_limit - p.stock_reserved;
  }

  function maxAllowed(p: Product) {
    const stockLeft = remaining(p);
    if (p.max_per_person == null) return stockLeft;
    return Math.min(stockLeft, p.max_per_person);
  }

  function changeQty(p: Product, delta: number) {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(maxAllowed(p), (prev[p.id] || 0) + delta));
      return { ...prev, [p.id]: next };
    });
  }

  function handlePhoneChange(v: string) {
    setPhoneDisplay(formatPhone(v));
  }

  async function checkDuplicateThenSubmit() {
    setError(null);
    const phone = normalizePhone(phoneDisplay);
    try {
      const checkRes = await fetch("/api/orders/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, phone }),
      });
      const checkData = await checkRes.json();
      if (checkRes.ok && checkData.count > 0) {
        const proceed = window.confirm(
          "이미 이 번호로 주문하신 내역이 있어요. 그래도 추가로 주문하시겠어요?"
        );
        if (!proceed) return;
      }
    } catch {
      // 중복확인 실패해도 주문 자체는 막지 않음
    }
    submit();
  }

  async function submit() {
    setError(null);

    if (productTotal === 0) {
      setError("상품을 1개 이상 선택해주세요.");
      return;
    }
    if (!nickname || !normalizePhone(phoneDisplay)) {
      setError("닉네임, 연락처를 모두 입력해주세요.");
      return;
    }
    if (fulfillmentType === "배송") {
      if (!complexId) {
        setError("아파트 단지를 선택해주세요.");
        return;
      }
      if (!dong.trim() || !unitNo.trim()) {
        setError("동, 호수를 입력해주세요.");
        return;
      }
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      setError("PIN은 숫자 4자리로 입력해주세요.");
      return;
    }
    if (!agreed) {
      setError("개인정보 수집·이용에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          nickname,
          phone: phoneDisplay,
          pin,
          fulfillmentType,
          paymentMethod: fulfillmentType === "픽업" ? paymentMethod : "계좌이체",
          complexId: fulfillmentType === "배송" ? complexId : undefined,
          dong: fulfillmentType === "배송" ? dong.trim() : undefined,
          unitNo: fulfillmentType === "배송" ? unitNo.trim() : undefined,
          entryPassword: fulfillmentType === "배송" ? entryPassword.trim() : undefined,
          agreed,
          items: products
            .filter((p) => (quantities[p.id] || 0) > 0)
            .map((p) => ({ productId: p.id, quantity: quantities[p.id] })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "주문 처리 중 오류가 발생했습니다.");
        setSubmitting(false);
        return;
      }
      if (fulfillmentType === "픽업" && paymentMethod === "현장결제") {
        // 현장결제는 입금확인 절차가 없어 바로 조회화면으로 안내
        router.push(`/lookup/${campaignId}`);
      } else {
        router.push(`/order/${campaignId}/pay/${data.orderId}`);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
      <h1 className="text-[15px] font-medium mb-3">{title || "상품을 선택해주세요"}</h1>

      {fulfillmentMode !== "delivery_only" && (pickupExpectedDate || pickupExpectedTimeNote) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
          <p className="text-[13px] text-amber-900">
            📦 예상 수령일:{" "}
            {pickupExpectedDate
              ? new Date(`${pickupExpectedDate}T00:00:00`).toLocaleDateString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                })
              : "미정"}
            {pickupExpectedTimeNote ? ` ${pickupExpectedTimeNote}` : ""}
          </p>
          <p className="text-[11px] text-amber-700 mt-1">
            ※ 입고 상황에 따라 일정이 변동될 수 있으니, 정확한 안내는 진행자 공지를 확인해주세요.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        {products.map((p) => {
          const left = remaining(p);
          const soldOut = left <= 0;
          return (
            <div
              key={p.id}
              className={`border rounded-lg p-2.5 text-center ${
                soldOut ? "opacity-45 border-neutral-200" : "border-neutral-300"
              } relative`}
            >
              {soldOut && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded">
                  품절
                </span>
              )}
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="w-full aspect-square object-cover rounded mb-1.5"
                />
              )}
              <p className="text-[13px] font-medium mb-0.5">{p.name}</p>
              <p className="text-[12px] text-neutral-500 mb-0.5">{formatWon(p.price)}</p>
              <p
                className={`text-[11px] mb-2 ${
                  left > 0 && left <= 2 ? "text-amber-600" : "text-neutral-400"
                }`}
              >
                {soldOut ? "재고 0개" : left <= 2 ? `재고 ${left}개 (마감임박)` : `재고 ${left}개`}
              </p>
              {p.max_per_person != null && (
                <p className="text-[10px] text-neutral-400 mb-2 -mt-1.5">
                  1인 최대 {p.max_per_person}개
                </p>
              )}
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => changeQty(p, -1)}
                  className="w-6 h-6 flex items-center justify-center border rounded disabled:opacity-30"
                >
                  −
                </button>
                <span className="text-[14px] font-medium min-w-[16px]">
                  {quantities[p.id] || 0}
                </span>
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => changeQty(p, 1)}
                  className="w-6 h-6 flex items-center justify-center border rounded disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-neutral-500 mb-1.5">수령 방법</p>
      <div className="flex gap-2 mb-3">
        {fulfillmentMode !== "pickup_only" && (
          <button
            type="button"
            disabled={complexes.length === 0}
            onClick={() => setFulfillmentType("배송")}
            className={`flex-1 border rounded-lg py-2 text-[13px] disabled:opacity-30 ${
              fulfillmentType === "배송" ? "bg-neutral-900 text-white" : ""
            }`}
          >
            문앞배송{deliveryFee > 0 ? ` (+${formatWon(deliveryFee)})` : ""}
          </button>
        )}
        {fulfillmentMode !== "delivery_only" && (
          <button
            type="button"
            onClick={() => setFulfillmentType("픽업")}
            className={`flex-1 border rounded-lg py-2 text-[13px] ${
              fulfillmentType === "픽업" ? "bg-neutral-900 text-white" : ""
            }`}
          >
            현장픽업
          </button>
        )}
      </div>
      {fulfillmentMode === "hybrid" && complexes.length === 0 && (
        <p className="text-[11px] text-neutral-400 mb-3">
          이 공구는 배송 가능한 지역이 등록되지 않아 현장픽업만 가능합니다.
        </p>
      )}

      {fulfillmentType === "픽업" && (
        <div className="mb-3">
          <p className="text-[12px] text-neutral-500 mb-1.5">결제 방법</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("계좌이체")}
              className={`flex-1 border rounded-lg py-2 text-[13px] ${
                paymentMethod === "계좌이체" ? "bg-neutral-900 text-white" : ""
              }`}
            >
              계좌이체(미리입금)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("현장결제")}
              className={`flex-1 border rounded-lg py-2 text-[13px] ${
                paymentMethod === "현장결제" ? "bg-neutral-900 text-white" : ""
              }`}
            >
              현장결제
            </button>
          </div>
        </div>
      )}

      <div className="border-t pt-3 flex flex-col gap-2.5 mb-4">
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="연락처"
          inputMode="numeric"
          value={phoneDisplay}
          onChange={(e) => handlePhoneChange(e.target.value)}
          maxLength={13}
        />
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="조회용 PIN 4자리 (숫자만)"
          inputMode="numeric"
          type="password"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
        />
        {fulfillmentType === "배송" && (
          <>
            <select
              className="w-full border rounded px-3 py-2 text-sm bg-white"
              value={complexId}
              onChange={(e) => setComplexId(e.target.value)}
            >
              {complexes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 -mt-1">
              목록에 없는 단지는 배송이 불가합니다. 현장픽업을 이용해주세요.
            </p>
            <div className="flex gap-2 items-center">
              <input
                className="w-20 border rounded px-3 py-2 text-sm text-center"
                placeholder=""
                value={dong}
                onChange={(e) => setDong(e.target.value)}
              />
              <span className="text-sm">동</span>
              <input
                className="w-20 border rounded px-3 py-2 text-sm text-center"
                placeholder=""
                inputMode="numeric"
                value={unitNo}
                onChange={(e) => setUnitNo(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <span className="text-sm">호</span>
            </div>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="공동출입 비밀번호 (선택, 예: #1003#0953)"
              value={entryPassword}
              onChange={(e) => setEntryPassword(e.target.value)}
            />
          </>
        )}
      </div>

      <label className="flex items-start gap-2 text-[12px] text-neutral-600 mb-4">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          [필수] 개인정보(닉네임, 연락처{fulfillmentType === "배송" ? ", 주소" : ""})는 공동구매
          주문처리{fulfillmentType === "배송" ? " 및 배송" : ""} 목적으로만 수집되며,{" "}
          {fulfillmentType === "배송" ? "배송완료" : "수령완료"} 후 15일 뒤 자동 폐기됩니다. 위
          수집·이용에 동의합니다.
        </span>
      </label>

      <div className="flex flex-col gap-1 py-2.5 border-t mb-3">
        {appliedDeliveryFee > 0 && (
          <div className="flex items-baseline justify-between text-[12px] text-neutral-500">
            <span>배송비</span>
            <span>{formatWon(appliedDeliveryFee)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-neutral-500">총 결제금액</span>
          <span className="text-[18px] font-medium">{formatWon(total)}</span>
        </div>
      </div>

      {error && <p className="text-[13px] text-red-600 mb-3">{error}</p>}

      <button
        onClick={checkDuplicateThenSubmit}
        disabled={submitting}
        className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "처리 중..." : "주문하기"}
      </button>

      <p className="text-[11px] text-red-500 mt-2 text-center font-medium">
        PIN은 나중에 주문조회 시 필요하니 꼭 기억해주세요
      </p>
    </div>
  );
}
