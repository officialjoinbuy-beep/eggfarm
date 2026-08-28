import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";
import { hashPhoneForNoshow } from "@/lib/noshow-hash";

// action: "confirm_payment" | "revert_payment" | "revert_cancel"
//       | "set_shipping" | "revert_shipping" | "revert_delivered"
//       | "pickup_complete" | "pickup_noshow"
// RLS 정책상 진행자는 본인 소유 공구의 주문에만 update 권한이 있으므로,
// 로그인 세션 기반 클라이언트로 호출하면 다른 사람 주문은 건드릴 수 없다.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, signature } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 본인 소유 주문인지 먼저 확인 (RLS도 이중으로 막아주지만 명시적으로 체크)
  const { data: order } = await supabase
    .from("orders")
    .select("id, campaign_id, phone, campaigns!inner(owner_id)")
    .eq("id", id)
    .single();
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  let rpcError = null;

  switch (action) {
    case "confirm_payment": {
      const { error } = await supabase.rpc("confirm_payment", { p_order_id: id });
      rpcError = error;
      break;
    }
    case "revert_payment": {
      const { error } = await supabase.rpc("revert_payment_confirm", { p_order_id: id });
      rpcError = error;
      break;
    }
    case "revert_cancel": {
      const { error } = await supabase.rpc("revert_cancel", { p_order_id: id });
      rpcError = error;
      break;
    }
    case "set_shipping": {
      const { error } = await supabase.rpc("set_delivery_status_safe", {
        p_order_id: id,
        p_from: "배송준비",
        p_to: "배송중",
      });
      rpcError = error;
      break;
    }
    case "revert_shipping": {
      const { error } = await supabase.rpc("set_delivery_status_safe", {
        p_order_id: id,
        p_from: "배송중",
        p_to: "배송준비",
      });
      rpcError = error;
      break;
    }
    case "revert_delivered": {
      const { error } = await supabase.rpc("set_delivery_status_safe", {
        p_order_id: id,
        p_from: "배송완료",
        p_to: "배송중",
      });
      rpcError = error;
      break;
    }
    case "pickup_complete": {
      if (!signature) {
        return NextResponse.json({ error: "수령 서명이 필요합니다." }, { status: 400 });
      }
      const { error } = await supabase.rpc("set_pickup_status", {
        p_order_id: id,
        p_to: "수령완료",
      });
      rpcError = error;
      if (!error) {
        await supabase.from("orders").update({ pickup_signature: signature }).eq("id", id);
      }
      break;
    }
    case "pickup_noshow": {
      const { error } = await supabase.rpc("set_pickup_status", {
        p_order_id: id,
        p_to: "노쇼",
      });
      rpcError = error;
      if (!error) {
        // 노쇼 대조용 해시 기록 (전화번호 원본은 저장하지 않음)
        const ownerId = (order.campaigns as unknown as { owner_id: string }).owner_id;
        const phoneHash = hashPhoneForNoshow(normalizePhone(order.phone));
        await supabase
          .from("noshow_records")
          .insert({ owner_id: ownerId, phone_hash: phoneHash, order_id: id });
      }
      break;
    }
    default:
      return NextResponse.json({ error: "알 수 없는 처리입니다." }, { status: 400 });
  }

  if (rpcError) {
    if (rpcError.message?.includes("OUT_OF_STOCK")) {
      return NextResponse.json(
        { error: "재고 부족으로 되돌릴 수 없습니다." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
