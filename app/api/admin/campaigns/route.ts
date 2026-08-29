import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title,
    bankName,
    accountNumber,
    accountHolder,
    inquiryUrl,
    startAt,
    closeDeadline,
    pickupExpectedDate,
    pickupExpectedTimeNote,
    complexes,
    products,
    fulfillmentMode,
    deliveryFee,
  } = body as {
    title: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    inquiryUrl?: string;
    startAt?: string; // ISO datetime string, optional
    closeDeadline?: string; // ISO datetime string, optional
    pickupExpectedDate?: string; // YYYY-MM-DD, optional
    pickupExpectedTimeNote?: string; // 자유입력 텍스트, optional
    complexes: string[];
    fulfillmentMode?: "pickup_only" | "delivery_only" | "hybrid";
    deliveryFee?: number;
    products: {
      name: string;
      price: number;
      stockLimit: number;
      maxPerPerson?: number | null;
      imageUrl?: string;
    }[];
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!title || !bankName || !accountNumber || !accountHolder) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }
  const validProducts = (products || []).filter((p) => p.name && p.price >= 0 && p.stockLimit > 0);
  if (validProducts.length === 0 || validProducts.length > 3) {
    return NextResponse.json({ error: "상품은 1~3개까지 등록 가능합니다." }, { status: 400 });
  }
  const mode: "pickup_only" | "delivery_only" | "hybrid" =
    fulfillmentMode === "pickup_only" || fulfillmentMode === "delivery_only" ? fulfillmentMode : "hybrid";
  const validComplexes = (complexes || []).map((c) => c.trim()).filter(Boolean);
  if (mode !== "pickup_only" && validComplexes.length === 0) {
    return NextResponse.json(
      { error: "배송 가능한 아파트 단지를 1개 이상 등록해주세요." },
      { status: 400 }
    );
  }
  if (closeDeadline && new Date(closeDeadline).getTime() <= Date.now()) {
    return NextResponse.json({ error: "마감일시는 현재보다 미래여야 합니다." }, { status: 400 });
  }
  if (startAt && closeDeadline && new Date(startAt).getTime() >= new Date(closeDeadline).getTime()) {
    return NextResponse.json({ error: "시작일시는 마감일시보다 이전이어야 합니다." }, { status: 400 });
  }

  // 모든 입력값 검증을 통과한 시도만 한도를 차감한다(검증 실패로 끝난 시도는 차감하지 않음).
  const { error: limitError } = await supabase.rpc("increment_campaign_count", {
    p_owner_id: user.id,
  });
  if (limitError) {
    return NextResponse.json(
      {
        error: "공구 생성 가능 횟수를 모두 사용했습니다.",
        code: "CAMPAIGN_LIMIT_REACHED",
        supportChatUrl: process.env.NEXT_PUBLIC_SUPPORT_CHAT_URL || null,
      },
      { status: 403 }
    );
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      owner_id: user.id,
      title,
      bank_name: bankName,
      account_number: normalizePhone(accountNumber), // 하이픈 제거
      account_holder: accountHolder,
      inquiry_url: inquiryUrl || null,
      start_at: startAt || null,
      close_deadline: closeDeadline || null,
      pickup_expected_date: pickupExpectedDate || null,
      pickup_expected_time_note: pickupExpectedTimeNote || null,
      fulfillment_mode: mode,
      delivery_fee: mode === "pickup_only" ? 0 : Math.max(0, Number(deliveryFee) || 0),
    })
    .select("id")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "공구 생성에 실패했습니다." }, { status: 500 });
  }

  const { error: productsError } = await supabase.from("products").insert(
    validProducts.map((p, idx) => ({
      campaign_id: campaign.id,
      name: p.name,
      price: p.price,
      stock_limit: p.stockLimit,
      max_per_person: p.maxPerPerson || null,
      image_url: p.imageUrl || null,
      display_order: idx,
    }))
  );

  if (productsError) {
    return NextResponse.json({ error: "상품 등록에 실패했습니다." }, { status: 500 });
  }

  const { error: complexesError } = await supabase.from("campaign_complexes").insert(
    validComplexes.map((name, idx) => ({
      campaign_id: campaign.id,
      name,
      display_order: idx,
    }))
  );

  if (complexesError) {
    return NextResponse.json({ error: "단지 등록에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ campaignId: campaign.id });
}
