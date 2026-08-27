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
  image_url?: string | null;
};

export default function OrderForm({
  campaignId,
  title,
  products,
}: {
  campaignId: string;
  title: string;
  products: Product[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(products.map((p) => [p.id, 0]))
  );
  const [nickname, setNickname] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [pin, setPin] = useState("");
  const [address, setAddress] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () =>
      products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.price, 0),
    [quantities, products]
  );

  function remaining(p: Product) {
    return p.stock_limit - p.stock_reserved;
  }

  function changeQty(p: Product, delta: number) {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(remaining(p), (prev[p.id] || 0) + delta));
      return { ...prev, [p.id]: next };
    });
  }

  function handlePhoneChange(v: string) {
    setPhoneDisplay(formatPhone(v));
  }

  async function submit() {
    setError(null);

    if (total === 0) {
      setError("상품을 1개 이상 선택해주세요.");
      return;
    }
    if (!nickname || !normalizePhone(phoneDisplay) || !address) {
      setError("닉네임, 연락처, 주소를 모두 입력해주세요.");
      return;
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
          address,
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
      router.push(`/order/${campaignId}/pay/${data.orderId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
      <h1 className="text-[15px] font-medium mb-3">{title || "상품을 선택해주세요"}</h1>

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
        <textarea
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="배송 주소"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2 text-[12px] text-neutral-600 mb-4">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          [필수] 개인정보(닉네임, 연락처, 주소)는 공동구매 주문처리 및 배송
          목적으로만 수집되며, 배송완료 후 15일 뒤 자동 폐기됩니다. 위 수집·이용에
          동의합니다.
        </span>
      </label>

      <div className="flex items-baseline justify-between py-2.5 border-t mb-3">
        <span className="text-[13px] text-neutral-500">총 결제금액</span>
        <span className="text-[18px] font-medium">{formatWon(total)}</span>
      </div>

      {error && <p className="text-[13px] text-red-600 mb-3">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "처리 중..." : "주문하기"}
      </button>

      <p className="text-[11px] text-neutral-400 mt-2 text-center">
        PIN은 나중에 주문조회 시 필요하니 꼭 기억해주세요
      </p>
    </div>
  );
}
