import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";

// 연락처+PIN으로 본인 주문 조회. 무차별 대입 공격 방어를 위해
// 최근 10분 내 실패 5회 이상이면 차단한다 (is_lookup_blocked RPC).
export async function POST(req: NextRequest) {
  const { campaignId, phone, pin } = await req.json();
  const normalizedPhone = normalizePhone(phone || "");

  if (!normalizedPhone || !/^[0-9]{4}$/.test(pin || "")) {
    return NextResponse.json({ error: "연락처와 PIN을 정확히 입력해주세요." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: blocked } = await supabase.rpc("is_lookup_blocked", {
    p_phone: normalizedPhone,
  });
  if (blocked) {
    return NextResponse.json(
      { error: "조회 시도가 많아 잠시 후 다시 시도해주세요. (10분 후 재시도 가능)" },
      { status: 429 }
    );
  }

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, nickname, phone, pin_hash, address, total_amount, payment_status, delivery_status, delivery_photo_url, delivery_completed_at, fulfillment_type, payment_method, pickup_status, pickup_token, campaign_id, created_at, order_items(product_name_snapshot, quantity, unit_price)"
    )
    .eq("campaign_id", campaignId)
    .eq("phone", normalizedPhone);

  // 여러 주문 중 PIN이 일치하는 것만 필터 (해시 비교는 DB가 아닌 서버 로직에서)
  let matched: typeof orders = [];
  if (orders) {
    for (const o of orders) {
      if (await bcrypt.compare(pin, o.pin_hash)) {
        matched.push(o);
      }
    }
  }

  await supabase.from("lookup_attempts").insert({
    phone: normalizedPhone,
    succeeded: matched.length > 0,
  });

  if (matched.length === 0) {
    return NextResponse.json({ error: "일치하는 주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 입금대기 안내에 필요한 계좌정보 조회
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("bank_name, account_number, account_holder")
    .eq("id", campaignId)
    .single();

  // pin_hash는 응답에서 제외하고, 배송사진은 signed URL(임시 링크)로 변환
  const safe = await Promise.all(
    matched.map(async ({ pin_hash, delivery_photo_url, ...rest }) => {
      let photoUrl: string | null = null;
      if (delivery_photo_url) {
        const { data } = await supabase.storage
          .from("delivery-photos")
          .createSignedUrl(delivery_photo_url, 60 * 10); // 10분간 유효
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        ...rest,
        delivery_photo_url: photoUrl,
        bank_name: campaign?.bank_name ?? null,
        account_number: campaign?.account_number ?? null,
        account_holder: campaign?.account_holder ?? null,
      };
    })
  );
  return NextResponse.json({ orders: safe });
}
