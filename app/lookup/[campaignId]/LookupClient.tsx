"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
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
  created_at: string;
  payment_deadline: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  fulfillment_type: "배송" | "픽업";
  payment_method: "계좌이체" | "현장결제";
  pickup_status: "수령대기" | "수령완료" | "노쇼" | null;
  pickup_token: string | null;
  order_items: { product_name_snapshot: string; quantity: number }[];
};

function PaymentPendingBanner({ order }: { order: OrderResult }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [copied, setCopied] = useState(false);

  async function copyAccount() {
    if (!order.account_number) return;
    await navigator.clipboard.writeText(order.account_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // 실제 자동취소 기준시간(payment_deadline)을 그대로 카운트다운에 사용.
  // 마감이 지나면 실제 취소(cron, 최대 5분 주기)까지 잠깐의 지연이 있을 수 있어
  // "곧 자동취소됩니다" 톤으로 안내한다.
  const deadlineMs = order.payment_deadline ? new Date(order.payment_deadline).getTime() : null;
  const remainingMs = deadlineMs !== null ? deadlineMs - now : null;
  const withinDeadline = remainingMs !== null && remainingMs > 0;
  const remainingMin = remainingMs !== null ? Math.floor(remainingMs / 60000) : 0;
  const remainingSec = remainingMs !== null ? Math.floor((remainingMs % 60000) / 1000) : 0;

  return (
    <div className="bg-red-50 rounded-lg p-3 mb-3">
      <p className="text-[13px] text-red-600 font-medium mb-2">
        입금이 확인되지 않았습니다{withinDeadline && ` (${remainingMin}분 ${remainingSec}초 남음)`}
      </p>
      {!withinDeadline && (
        <p className="text-[12px] text-red-600 mb-2">곧 자동취소됩니다. 서둘러 입금해주세요.</p>
      )}
      {order.account_number && (
        <button
          onClick={copyAccount}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-white rounded mb-1.5"
        >
          <span className="text-[13px] font-medium">
            {order.bank_name} {order.account_number}
          </span>
          <span className="text-[12px] text-neutral-400">{copied ? "복사됨" : "복사"}</span>
        </button>
      )}
      {order.account_holder && (
        <p className="text-[12px] text-neutral-500">예금주 {order.account_holder}</p>
      )}
    </div>
  );
}

const STEPS = ["입금확인", "배송준비", "배송중", "배송완료"] as const;
const PICKUP_STEPS = ["입금확인", "수령대기", "수령완료"] as const;

function PickupQrCard({ order }: { order: OrderResult }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!order.pickup_token) return;
    QRCode.toDataURL(order.pickup_token, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [order.pickup_token]);

  return (
    <div className="bg-white border rounded-lg p-4 mb-3 flex flex-col items-center">
      <p className="text-[12px] text-neutral-500 mb-2">현장 수령 시 이 QR을 보여주세요</p>
      {qrDataUrl && <img src={qrDataUrl} alt="픽업 QR코드" className="w-40 h-40" />}
    </div>
  );
}

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

  if (order.fulfillment_type === "픽업") {
    let current = 0;
    if (order.pickup_status === "노쇼") {
      return (
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-[13px] text-red-600 font-medium">노쇼 처리됨</p>
        </div>
      );
    }
    if (order.pickup_status === "수령완료") current = 2;
    else if (order.pickup_status === "수령대기") current = 1;

    return (
      <div className="flex flex-col">
        {PICKUP_STEPS.map((label, idx) => {
          const done = idx <= current;
          const isLast = idx === PICKUP_STEPS.length - 1;
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

            {o.payment_status === "입금확인대기" && o.payment_method === "계좌이체" && (
              <PaymentPendingBanner order={o} />
            )}

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
              <p
                className={`text-[11px] text-right mt-1 ${
                  o.payment_status === "입금확인완료" ? "text-green-600" : "text-amber-600"
                }`}
              >
                {o.payment_status === "입금확인완료"
                  ? "결제완료"
                  : o.payment_method === "현장결제"
                  ? "현장에서 결제 예정"
                  : "입금 확인 중"}
              </p>
            </div>

            {o.fulfillment_type === "픽업" && o.pickup_status === "수령대기" && (
              <PickupQrCard order={o} />
            )}

            <div className="mb-3">
              {o.fulfillment_type === "배송" && (
                <>
                  <p className="text-[12px] text-neutral-500 mb-1">배송 주소</p>
                  <p className="text-[13px] mb-3">{o.address}</p>
                </>
              )}
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
