import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";
import { parseBankCsv, extractDigits, SUPPORTED_BANKS } from "@/lib/bank-csv";

// 은행 거래내역 CSV를 업로드하면, 대기중인 주문의 "추천 입금자명"(전화번호
// 뒷자리)+금액과 자동으로 대조한다. 완전히 일치하는 건은 그 자리에서
// 입금확인 처리하고, 애매한 건(이름은 다른데 금액만 같은 경우 등)은 후보로
// 남겨 진행자가 직접 확인하게 한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;
  const { csvText } = (await req.json()) as { csvText?: string };
  if (!csvText) {
    return NextResponse.json({ error: "CSV 내용이 비어있습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, owner_id")
    .eq("id", campaignId)
    .single();
  if (!campaign || campaign.owner_id !== user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { bank, transactions } = parseBankCsv(csvText);
  if (!bank) {
    return NextResponse.json(
      {
        error:
          "지원하지 않는 양식이에요. 오픈채팅으로 문의해주시면 추가해드릴게요.",
        supportedBanks: SUPPORTED_BANKS.map((b) => b.bankName),
      },
      { status: 422 }
    );
  }

  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("id, nickname, phone, total_amount")
    .eq("campaign_id", campaignId)
    .eq("payment_status", "입금확인대기")
    .is("cancelled_at", null);

  const orders = (pendingOrders ?? []).map((o) => ({
    ...o,
    suggestedDigits: extractDigits(normalizePhone(o.phone).replace(/^010/, "")),
  }));

  const autoConfirmed: { orderId: string; nickname: string; amount: number }[] = [];
  const ambiguous: { orderId: string; nickname: string; amount: number; reason: string }[] = [];
  const usedOrderIds = new Set<string>();

  for (const tx of transactions) {
    const txDigits = extractDigits(tx.depositorRaw);
    // 이름/전화번호 뒷자리 + 금액이 정확히 일치하는 대기주문을 찾는다.
    const match = orders.find(
      (o) =>
        !usedOrderIds.has(o.id) &&
        o.total_amount === tx.amount &&
        o.suggestedDigits.length >= 4 &&
        txDigits.includes(o.suggestedDigits)
    );
    if (match) {
      usedOrderIds.add(match.id);
      const { error } = await supabase.rpc("confirm_payment", { p_order_id: match.id });
      if (!error) {
        autoConfirmed.push({ orderId: match.id, nickname: match.nickname, amount: match.total_amount });
      } else {
        ambiguous.push({
          orderId: match.id,
          nickname: match.nickname,
          amount: match.total_amount,
          reason: "일치하는 것으로 보이나 자동확인 처리 중 오류가 발생했어요.",
        });
      }
    }
  }

  // 매칭 안 된 대기주문 중, 금액만 같은 거래가 있는 경우 후보로 안내
  for (const o of orders) {
    if (usedOrderIds.has(o.id)) continue;
    const amountOnlyMatch = transactions.some((tx) => tx.amount === o.total_amount);
    if (amountOnlyMatch) {
      ambiguous.push({
        orderId: o.id,
        nickname: o.nickname,
        amount: o.total_amount,
        reason: "금액은 일치하는 거래가 있지만 입금자명이 달라 자동확인하지 않았어요.",
      });
    }
  }

  return NextResponse.json({
    bankName: bank.bankName,
    transactionCount: transactions.length,
    autoConfirmed,
    ambiguous,
  });
}
