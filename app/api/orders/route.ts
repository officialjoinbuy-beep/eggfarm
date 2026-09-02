import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import { hashPhoneForNoshow } from "@/lib/noshow-hash";
import { encryptStaffField } from "@/lib/staff-crypto";
import { refreshKakaoToken, sendKakaoMemo } from "@/lib/kakao";

// 새 주문 접수 시 공구 진행자가 카카오 알림을 연결해뒀다면 본인 카톡으로 알림을 보낸다.
// 실패해도 주문 처리 자체는 절대 막지 않는다(알림은 부가기능).
async function notifyOwnerNewOrder(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string,
  orderId: string,
  origin: string
) {
  try {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("title, owner_id")
      .eq("id", campaignId)
      .single();
    if (!campaign) return;

    const { data: limits } = await supabase
      .from("account_limits")
      .select("kakao_refresh_token")
      .eq("owner_id", campaign.owner_id)
      .single();
    if (!limits?.kakao_refresh_token) return;

    const { data: order } = await supabase
      .from("orders")
      .select("total_amount")
      .eq("id", orderId)
      .single();

    const { access_token } = await refreshKakaoToken(limits.kakao_refresh_token);
    await sendKakaoMemo(
      access_token,
      `[${campaign.title}] 새 주문이 접수됐어요 (${(order?.total_amount ?? 0).toLocaleString()}원)`,
      `${origin}/admin/${campaignId}`
    );
  } catch (e) {
    console.error("카카오 알림 발송 실패(무시하고 계속):", e);
  }
}

// 구매자 주문접수. service_role로 create_order/create_pickup_order RPC를 호출한다.
// 재고 확인 + 차감 + 주문 생성은 DB 함수 내부에서 하나의 트랜잭션으로 처리되므로
// 여러 명이 동시에 주문해도 재고 초과가 발생하지 않는다.
export async function POST(req: NextRequest) {
  try {
    return await handleCreateOrder(req);
  } catch (e) {
    console.error("POST /api/orders unhandled exception:", e);
    return NextResponse.json({ error: "주문 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

async function handleCreateOrder(req: NextRequest) {
  const body = await req.json();
  const {
    campaignId,
    nickname,
    phone,
    pin,
    fulfillmentType,
    paymentMethod,
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
    fulfillmentType: "배송" | "픽업";
    paymentMethod: "계좌이체" | "현장결제";
    complexId?: string;
    dong?: string;
    unitNo?: string;
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
  const isPickup = fulfillmentType === "픽업";
  if (!nickname || !phone || (!isPickup && (!complexId || !dong || !unitNo))) {
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

  // 인당 최대구매수량 서버측 검증 (클라이언트 조작 방지)
  const { data: productLimits } = await supabase
    .from("products")
    .select("id, name, max_per_person")
    .in(
      "id",
      validItems.map((i) => i.productId)
    );
  for (const item of validItems) {
    const p = productLimits?.find((x) => x.id === item.productId);
    if (p?.max_per_person != null && item.quantity > p.max_per_person) {
      return NextResponse.json(
        { error: `"${p.name}"은(는) 1인당 최대 ${p.max_per_person}개까지 구매 가능합니다.` },
        { status: 400 }
      );
    }
  }

  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .select("owner_id, payment_timeout_minutes, is_closed, start_at")
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

  const normalizedPhone = normalizePhone(phone);

  // 현장픽업 노쇼 2회 이상이면 차단 (진행자 계정 단위)
  if (isPickup) {
    const phoneHash = hashPhoneForNoshow(normalizedPhone);
    const { data: blocked, error: noshowCheckError } = await supabase.rpc("is_noshow_blocked", {
      p_owner_id: campaign.owner_id,
      p_phone_hash: phoneHash,
    });
    if (noshowCheckError) {
      console.error("is_noshow_blocked check failed:", noshowCheckError);
    }
    if (blocked) {
      return NextResponse.json(
        { error: "노쇼 2회로 현장픽업 주문이 제한되었습니다. 진행자에게 문의해주세요." },
        { status: 403 }
      );
    }
  }

  const pinHash = await bcrypt.hash(pin, 10);

  if (isPickup) {
    const { data: orderId, error } = await supabase.rpc("create_pickup_order", {
      p_campaign_id: campaignId,
      p_nickname: nickname,
      p_phone: normalizedPhone,
      p_pin_hash: pinHash,
      p_payment_method: paymentMethod === "현장결제" ? "현장결제" : "계좌이체",
      p_items: validItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      p_payment_timeout_minutes: campaign.payment_timeout_minutes,
    });

    if (error) {
      console.error("create_pickup_order failed:", error);
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
      if (error.message?.includes("PICKUP_NOT_AVAILABLE")) {
        return NextResponse.json(
          { error: "이 공구는 현장픽업을 지원하지 않습니다." },
          { status: 400 }
        );
      }
      if (error.message?.includes("PRODUCT_INACTIVE")) {
        return NextResponse.json(
          { error: "선택하신 상품 중 판매중지된 상품이 있습니다. 다시 확인해주세요." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "주문 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
    await notifyOwnerNewOrder(supabase, campaignId, orderId, req.nextUrl.origin);
    return NextResponse.json({ orderId });
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
  const unitNoPadded = (unitNo as string).padStart(4, "0");
  const composedAddress = `${complex.name} ${dong}동 ${unitNoPadded}호`;

  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_campaign_id: campaignId,
    p_nickname: nickname,
    p_phone: normalizedPhone,
    p_pin_hash: pinHash,
    p_address: composedAddress,
    p_items: validItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
    p_payment_timeout_minutes: campaign.payment_timeout_minutes,
  });

  if (error) {
    console.error("create_order failed:", error);
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
    if (error.message?.includes("DELIVERY_NOT_AVAILABLE")) {
      return NextResponse.json(
        { error: "이 공구는 문앞배송을 지원하지 않습니다." },
        { status: 400 }
      );
    }
    if (error.message?.includes("PRODUCT_INACTIVE")) {
      return NextResponse.json(
        { error: "선택하신 상품 중 판매중지된 상품이 있습니다. 다시 확인해주세요." },
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
      entry_password: entryPassword ? encryptStaffField(entryPassword) : null,
    })
    .eq("id", orderId);

  await notifyOwnerNewOrder(supabase, campaignId, orderId, req.nextUrl.origin);
  return NextResponse.json({ orderId });
}
