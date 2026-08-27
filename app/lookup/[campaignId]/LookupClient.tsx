"use client";

import { useState } from "react";
import { formatWon, formatPhone } from "@/lib/format";
import BuyerNav from "@/components/BuyerNav";

type OrderResult = {
  id: string;
  nickname: string;
  address: string;
  total_amount: number;
  payment_status: string;
  delivery_status: string;
  delivery_photo_url: string | null;
  order_items: { product_name_snapshot: string; quantity: number }[];
};

const STEPS = ["입금확인", "배송준비", "배송중", "배송완료"] as const;

// 주문의 현재 상태(입금+배송)를 스텝 인덱스(0~3)로 변환.
// 0=입금확인 전, 1=배송준비(입금확인 완료), 2=배송중, 3=배송완료
function getStepIndex(o: OrderResult): number {
  if (o.payment_status !== "입금확인완료") return 0;
  if (o.delivery_status === "배송완료") return 3;
  if (o.delivery_status === "배송중") return 2;
  return 1;
}

function StatusStepper({ order }: { order: OrderResult }) {
  if (order.payment_status === "주문취소(미입금)") {
    return (
      <div className="bg-red-50 rounded-lg p-3 text-center">
        <p className="text-[13px] text-red-600 font-medium">주문취소(미입금)</p>
      </div>
    );
  }

  const current = getStepIndex(order);

  return (
    <div className="flex flex-col">
      {STEPS.map((label, idx) => {
        const done = idx <= current;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  done ? "bg-neutral-900" : "bg-neutral-200"
                }`}
              />
              {!isLast && (
                <div
                  className={`w-px flex-1 min-h-[22px] ${
                    idx < current ? "bg-neutral-900" : "bg-neutral-200"
                  }`}
                />
              )}
            </div>
            <p
              className={`text-[13px] pb-5 ${
                done ? "text-neutral-900 font-medium" : "text-neutral-400"
              } ${idx === current ? "font-semibold" : ""}`}
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function LookupClient({
  campaignId,
  inquiryUrl,
}: {
  campaignId: string;
  inquiryUrl: string | null;
}) {
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, phone: phoneDisplay, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "조회에 실패했습니다.");
        setLoading(false);
        return;
      }
      setOrders(data.orders);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    }
    setLoading(false);
  }

  if (orders) {
    return (
      <main className="max-w-md mx-auto p-5 flex flex-col gap-3">
        <BuyerNav campaignId={campaignId} active="lookup" />
        {orders.map((o) => (
          <div
            key={o.id}
            className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200"
          >
            <p className="text-[15px] font-medium mb-3">{o.nickname}님 주문내역</p>

            <div className="border-y py-3 mb-3">
              {o.order_items.map((item, i) => (
                <div key={i} className="flex justify-between text-[13px] mb-1.5">
                  <span className="text-neutral-500">
                    {item.product_name_snapshot} x {item.quantity}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-[14px] font-medium mt-2 pt-2 border-t">
                <span>총 결제금액</span>
                <span>{formatWon(o.total_amount)}</span>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-[12px] text-neutral-500 mb-1">배송 주소</p>
              <p className="text-[13px] mb-3">{o.address}</p>
              <StatusStepper order={o} />
            </div>

            {o.delivery_status === "배송완료" && o.delivery_photo_url?.startsWith("http") && (
              <div>
                <p className="text-[12px] text-neutral-500 mb-1.5">배송사진</p>
                <img
                  src={o.delivery_photo_url}
                  alt="배송사진"
                  className="w-full rounded-lg border"
                />
              </div>
            )}
          </div>
        ))}
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <BuyerNav campaignId={campaignId} active="lookup" />
      <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
        <p className="text-[15px] font-medium mb-3">내 주문 조회</p>
        <div className="flex flex-col gap-2.5 mb-1.5">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="연락처"
            inputMode="tel"
            value={phoneDisplay}
            onChange={(e) => setPhoneDisplay(formatPhone(e.target.value))}
            maxLength={13}
          />
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="PIN 4자리"
            inputMode="numeric"
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
        <button
          onClick={search}
          disabled={loading}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium mt-2.5 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "조회하기"}
        </button>

        <div className="mt-4 border-t pt-3">
          <p className="text-[12px] text-neutral-500 mb-2">PIN을 잃어버리셨나요?</p>
          {inquiryUrl ? (
            <a
              href={inquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-1.5 border rounded-lg py-2 text-[13px]"
            >
              관리자에게 1:1 문의하기
            </a>
          ) : (
            <p className="text-center text-[12px] text-neutral-400 border rounded-lg py-2">
              문의 링크가 등록되지 않았습니다
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
