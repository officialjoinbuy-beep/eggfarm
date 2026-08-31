"use client";

import { useRef, useState } from "react";
import { formatWon } from "@/lib/format";

type Result = {
  bankName: string;
  transactionCount: number;
  autoConfirmed: { orderId: string; nickname: string; amount: number }[];
  ambiguous: { orderId: string; nickname: string; amount: number; reason: string }[];
};

const SUPPORTED_BANKS_LABEL = "카카오뱅크, 국민은행, 신한은행";

// 은행 앱에서 내려받은 거래내역 CSV로 입금대기 주문을 자동 대조한다.
// 완전일치는 그 자리에서 입금확인 처리되고, 애매한 건은 목록으로만 보여준다.
export default function BankCsvReconcile({
  campaignId,
  onConfirmed,
}: {
  campaignId: string;
  onConfirmed: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportedBanks, setSupportedBanks] = useState<string[] | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setSupportedBanks(null);
    const csvText = await file.text();
    const res = await fetch(`/api/admin/campaigns/${campaignId}/reconcile-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "대조에 실패했습니다.");
      setSupportedBanks(data.supportedBanks ?? null);
      return;
    }
    setResult(data);
    if (data.autoConfirmed.length > 0) onConfirmed();
  }

  return (
    <div className="border rounded-lg p-3 mb-3">
      <p className="text-[13px] font-medium mb-1">입금대조 CSV 업로드</p>
      <p className="text-[11px] text-neutral-400 mb-2.5">
        현재 지원 가능한 은행: {SUPPORTED_BANKS_LABEL} — 은행 앱에서 거래내역을 CSV로
        내려받아 올려주세요.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="w-full border rounded-lg py-2 text-[13px] disabled:opacity-50"
      >
        {loading ? "대조 중..." : "CSV 파일 선택"}
      </button>

      {error && (
        <div className="mt-2.5 text-[12px] text-red-600">
          <p>{error}</p>
          {supportedBanks && (
            <p className="text-neutral-500 mt-1">
              지원 은행: {supportedBanks.join(", ")} — 다른 은행이 필요하시면 오픈채팅으로
              문의해주세요.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-2.5 text-[12px]">
          <p className="text-neutral-500 mb-1.5">
            {result.bankName} · 거래 {result.transactionCount}건 확인
          </p>
          {result.autoConfirmed.length > 0 && (
            <div className="mb-2">
              <p className="text-green-700 font-medium mb-1">
                자동 입금확인 완료 ({result.autoConfirmed.length}건)
              </p>
              {result.autoConfirmed.map((o) => (
                <p key={o.orderId} className="text-neutral-500">
                  {o.nickname} · {formatWon(o.amount)}
                </p>
              ))}
            </div>
          )}
          {result.ambiguous.length > 0 && (
            <div>
              <p className="text-amber-700 font-medium mb-1">
                직접 확인 필요 ({result.ambiguous.length}건)
              </p>
              {result.ambiguous.map((o) => (
                <p key={o.orderId} className="text-neutral-500">
                  {o.nickname} · {formatWon(o.amount)} — {o.reason}
                </p>
              ))}
            </div>
          )}
          {result.autoConfirmed.length === 0 && result.ambiguous.length === 0 && (
            <p className="text-neutral-400">일치하는 대기주문이 없었어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
