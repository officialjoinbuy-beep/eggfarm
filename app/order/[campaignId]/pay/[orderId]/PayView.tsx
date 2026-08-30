"use client";

import { useState } from "react";
import Link from "next/link";
import { formatWon, normalizePhone } from "@/lib/format";

export default function PayView({
  campaignId,
  bankName,
  accountNumber,
  accountHolder,
  totalAmount,
  timeoutMinutes,
  nickname,
  phone,
}: {
  campaignId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  totalAmount: number;
  timeoutMinutes: number;
  nickname: string;
  phone: string;
}) {
  const [copied, setCopied] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const hours = Math.round(timeoutMinutes / 60);
  const suggestedDepositorName = normalizePhone(phone).replace(/^010/, "");

  async function copyAccount() {
    await navigator.clipboard.writeText(accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyDepositorName() {
    await navigator.clipboard.writeText(suggestedDepositorName);
    setNameCopied(true);
    setTimeout(() => setNameCopied(false), 2000);
  }

  return (
    <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-200 text-center">
      <p className="text-[15px] font-medium mb-1">주문이 접수됐습니다</p>
      <p className="text-[13px] text-neutral-500 mb-4">아래 계좌로 입금해주세요</p>

      <div className="bg-white rounded-lg p-3.5 text-left border">
        <p className="text-[12px] text-neutral-500 mb-1">입금 계좌</p>
        <button
          onClick={copyAccount}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-neutral-50 rounded"
        >
          <span className="text-[14px] font-medium">
            {bankName} {accountNumber}
          </span>
          <span className="text-[12px] text-neutral-400">복사</span>
        </button>
        <p className="text-[13px] text-neutral-600 mt-2.5">예금주 {accountHolder}</p>
      </div>

      {copied && (
        <p className="text-[12px] text-green-600 mt-2">계좌번호가 복사됐습니다</p>
      )}

      <div className="bg-white rounded-lg p-3.5 text-left border mt-3">
        <p className="text-[12px] text-neutral-500 mb-1">추천 입금자명</p>
        <button
          onClick={copyDepositorName}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-red-50 rounded"
        >
          <span className="text-[20px] font-bold text-red-600">{suggestedDepositorName}</span>
          <span className="text-[12px] text-neutral-400">복사</span>
        </button>
        <p className="text-[11px] text-red-500 mt-1.5 font-medium">
          위 이름을 복사해서 그대로 입금자명에 붙여넣어주세요.
          <br />이 이름으로만 입금확인이 가능합니다.
        </p>
      </div>
      {nameCopied && (
        <p className="text-[12px] text-green-600 mt-2">입금자명이 복사됐습니다</p>
      )}

      <p className="text-[17px] font-medium mt-4">입금액 {formatWon(totalAmount)}</p>

      <div className="mt-4 bg-red-50 rounded-lg p-3 text-left">
        <p className="text-[13px] text-red-600 font-medium">
          {hours}시간 내 위 계좌로 입금해주세요.
        </p>
        <p className="text-[13px] text-red-600 mt-1">
          입금이 확인되지 않으면 주문이 자동 취소됩니다.
        </p>
      </div>

      <Link
        href={`/lookup/${campaignId}`}
        className="block mt-4 text-[13px] text-neutral-500 underline"
      >
        내 주문 조회하러 가기
      </Link>
    </div>
  );
}
