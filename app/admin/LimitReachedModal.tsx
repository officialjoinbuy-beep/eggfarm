"use client";

import { useState } from "react";

const PACKAGES = [
  { name: "50회", credits: 50, price: 29000 },
  { name: "100회", credits: 100, price: 49000 },
  { name: "300회", credits: 300, price: 119000 },
];

// 플랫폼(진행자) 입금계좌 및 재초대용 연락처 정보 - 환경변수로 설정.
const BANK_NAME = process.env.NEXT_PUBLIC_CREDIT_BANK_NAME || "";
const BANK_ACCOUNT = process.env.NEXT_PUBLIC_CREDIT_BANK_ACCOUNT || "";
const BANK_HOLDER = process.env.NEXT_PUBLIC_CREDIT_BANK_HOLDER || "";
const GITHUB_ID = process.env.NEXT_PUBLIC_ARININE_GITHUB_ID || "";
const VERCEL_EMAIL = process.env.NEXT_PUBLIC_ARININE_VERCEL_EMAIL || "";
const SUPABASE_EMAIL = process.env.NEXT_PUBLIC_ARININE_SUPABASE_EMAIL || "";

type Step = "select" | "pay" | "done";

export default function LimitReachedModal({
  supportChatUrl,
  onClose,
}: {
  supportChatUrl: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<(typeof PACKAGES)[number] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submitRequest() {
    if (!selected) return;
    setSubmitting(true);
    await fetch("/api/admin/credit-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageName: selected.name }),
    });
    setSubmitting(false);
    setStep("done");
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-6 w-full max-w-sm shadow-xl">
        {step === "select" && (
          <>
            <p className="text-[15px] font-medium mb-1 text-center">🔒 생성 가능 횟수를 모두 사용했어요</p>
            <p className="text-[13px] text-neutral-500 mb-5 text-center leading-relaxed">
              기존 공구는 계속 정상 이용 가능합니다.
              <br />
              추가로 이용하시려면 크레딧을 충전해주세요.
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {PACKAGES.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSelected(p)}
                  className={`w-full border rounded-lg px-3 py-2.5 flex items-center justify-between text-left ${
                    selected?.name === p.name
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200"
                  }`}
                >
                  <span className="text-[14px] font-medium">{p.name}</span>
                  <span className="text-[13px] text-neutral-500">{p.price.toLocaleString()}원</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => selected && setStep("pay")}
              disabled={!selected}
              className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 mb-2"
            >
              선택한 크레딧 구매하기
            </button>
            {supportChatUrl && (
              <a
                href={supportChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-[12px] text-neutral-500 underline underline-offset-2 py-1"
              >
                또는 오픈채팅으로 문의하기 →
              </a>
            )}
            <button onClick={onClose} className="w-full border rounded-lg py-2.5 text-sm mt-1">
              닫기
            </button>
          </>
        )}

        {step === "pay" && selected && (
          <>
            <p className="text-[15px] font-medium mb-4 text-center">입금 안내</p>
            <div className="bg-neutral-50 rounded-lg p-3 mb-3">
              <p className="text-[12px] text-neutral-500 mb-1">입금 계좌</p>
              <button
                onClick={() => copy(`${BANK_NAME} ${BANK_ACCOUNT}`)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-[15px] font-medium">
                  {BANK_NAME || "계좌정보 미설정"} {BANK_ACCOUNT}
                </span>
                <span className="text-[12px] text-neutral-400">복사</span>
              </button>
              {BANK_HOLDER && (
                <p className="text-[12px] text-neutral-500 mt-1">예금주 {BANK_HOLDER}</p>
              )}
            </div>
            <p className="text-[13px] text-center mb-4">
              <span className="font-medium">{selected.name}</span> ·{" "}
              {selected.price.toLocaleString()}원
            </p>
            <p className="text-[11px] text-neutral-400 mb-4 text-center leading-relaxed">
              입금 확인 후 GitHub/Vercel/Supabase 재초대를 통해 한도를 늘려드립니다.
              <br />
              입금하실 분 성명을 입금자명에 그대로 넣어주세요.
            </p>
            <button
              onClick={submitRequest}
              disabled={submitting}
              className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 mb-2"
            >
              {submitting ? "처리 중..." : "입금 완료 - 요청 접수하기"}
            </button>
            <button onClick={() => setStep("select")} className="w-full border rounded-lg py-2.5 text-sm">
              뒤로
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <p className="text-[15px] font-medium mb-2 text-center">✅ 요청이 접수됐어요</p>
            <p className="text-[13px] text-neutral-500 mb-4 text-center leading-relaxed">
              입금 확인 후 아래 3곳에 진행자를 초대해주시면
              <br />
              한도를 늘려드릴게요.
            </p>
            <div className="flex flex-col gap-2 mb-4 text-[13px]">
              {GITHUB_ID && (
                <div className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                  <span>GitHub: {GITHUB_ID}</span>
                  <button onClick={() => copy(GITHUB_ID)} className="text-[12px] text-neutral-400">
                    복사
                  </button>
                </div>
              )}
              {VERCEL_EMAIL && (
                <div className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                  <span>Vercel: {VERCEL_EMAIL}</span>
                  <button onClick={() => copy(VERCEL_EMAIL)} className="text-[12px] text-neutral-400">
                    복사
                  </button>
                </div>
              )}
              {SUPABASE_EMAIL && (
                <div className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                  <span>Supabase: {SUPABASE_EMAIL}</span>
                  <button onClick={() => copy(SUPABASE_EMAIL)} className="text-[12px] text-neutral-400">
                    복사
                  </button>
                </div>
              )}
            </div>
            {copied && <p className="text-[12px] text-green-600 text-center mb-2">복사됐습니다</p>}
            <button onClick={onClose} className="w-full border rounded-lg py-2.5 text-sm">
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
