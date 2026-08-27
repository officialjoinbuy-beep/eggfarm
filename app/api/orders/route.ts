import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";

// 구매자 주문접수. service_role로 create_order RPC를 호출한다.
// 재고 확인 + 차감 + 주문 생성은 DB 함수 내부에서 하나의 트랜잭션으로 처리되므로
// 여러 명이 동시에 주문해도 재고 초과가 발생하지 않는다.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    campaignId,
    nickname,
    phone,
    pin,
    complexId,
    dong,
    unitNo,
    entryPassword,
    items,
    agreed,
  } = body as {
    campaignId: string;
    nickname: string;
    phone: string;
    pin: string;
    complexId: string;
    dong: string;
    unitNo: string;
    entryPassword?: string;
    items: { productId: string; quantity: number }[];
    agreed: boolean;
  };

  if (!agreed) {
    return NextResponse.json(
      { error: "개인정보 수집·이용에 동의해야 주문할 수 있습니다." },
      { status: 400 }
    );
  }
  if (!nickname || !phone || !complexId || !dong || !unitNo) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }
  if (!/^[0-9]{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN은 숫자 4자리여야 합니다." }, { status: 400 });
  }
  const validItems = (items || []).filter((i) => i.quantity > 0);
  if (validItems.length === 0) {
    return NextResponse.json({ error: "상품을 1개 이상 선택해주세요." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .select("payment_timeout_minutes, is_closed, start_at")
    .eq("id", campaignId)
    .single();

  if (campaignErr || !campaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }
  if (campaign.is_closed) {
    return NextResponse.json(
      { error: "죄송합니다, 방금 마감되었습니다." },
      { status: 409 }
    );
  }
  if (campaign.start_at && new Date(campaign.start_at).getTime() > Date.now()) {
    return NextResponse.json(
      { error: "아직 주문접수가 시작되지 않았습니다." },
      { status: 409 }
    );
  }

  // 등록된 단지인지 확인 (배송 불가 지역 주문 방지)
  const { data: complex } = await supabase
    .from("campaign_complexes")
    .select("id, name")
    .eq("id", complexId)
    .eq("campaign_id", campaignId)
    .single();

  if (!complex) {
    return NextResponse.json(
      { error: "선택하신 단지는 이 공구에서 배송 가능한 지역이 아닙니다." },
      { status: 400 }
    );
  }

  // 호수는 4자리로 0채움 통일 (엑셀 정리 시 자릿수 맞춤용)
  const unitNoPadded = unitNo.padStart(4, "0");
  const composedAddress = `${complex.name} ${dong}동 ${unitNoPadded}호`;

  const pinHash = await bcrypt.hash(pin, 10);

  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_campaign_id: campaignId,
    p_nickname: nickname,
    p_phone: normalizePhone(phone),
    p_pin_hash: pinHash,
    p_address: composedAddress,
    p_items: validItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
    p_payment_timeout_minutes: campaign.payment_timeout_minutes,
  });

  if (error) {
    if (error.message?.includes("OUT_OF_STOCK")) {
      return NextResponse.json(
        { error: "선택하신 상품 중 품절된 상품이 있습니다. 다시 확인해주세요." },
        { status: 409 }
      );
    }
    if (error.message?.includes("CAMPAIGN_CLOSED")) {
      return NextResponse.json(
        { error: "죄송합니다, 방금 마감되었습니다." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "주문 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  // 단지명/동/호수/출입비밀번호를 구조화된 컬럼에도 저장(엑셀 분리 출력용)
  await supabase
    .from("orders")
    .update({
      complex_name: complex.name,
      dong,
      unit_no: unitNoPadded,
      entry_password: entryPassword || null,
    })
    .eq("id", orderId);

  return NextResponse.json({ orderId });
}
