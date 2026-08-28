import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";

// 진행자가 공구 상세정보(수정 화면)를 불러올 때 사용.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "id, title, bank_name, account_number, account_holder, inquiry_url, start_at, close_deadline, is_closed, fulfillment_mode, delivery_fee"
    )
    .eq("id", id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: complexes } = await supabase
    .from("campaign_complexes")
    .select("id, name")
    .eq("campaign_id", id)
    .order("display_order");

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, stock_limit, stock_reserved, max_per_person, is_active, image_url")
    .eq("campaign_id", id)
    .order("display_order");

  return NextResponse.json({ campaign, complexes: complexes ?? [], products: products ?? [] });
}

// 진행중인 공구도 정보 수정 가능 (제목/계좌/마감일시/문의링크/단지/상품).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const {
    title,
    bankName,
    accountNumber,
    accountHolder,
    inquiryUrl,
    startAt,
    closeDeadline,
    complexes,
    products,
    deletedProductIds,
  } = body as {
    title: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    inquiryUrl?: string;
    startAt?: string | null;
    closeDeadline?: string | null;
    complexes: string[];
    products?: {
      id?: string; // 없으면 신규 추가
      name: string;
      price: number;
      stockLimit: number;
      maxPerPerson?: number | null;
      isActive?: boolean;
    }[];
    deletedProductIds?: string[];
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

  const { data: existingCampaign } = await supabase
    .from("campaigns")
    .select("fulfillment_mode")
    .eq("id", id)
    .single();
  if (!existingCampaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }

  const validComplexes = (complexes || []).map((c) => c.trim()).filter(Boolean);
  if (existingCampaign.fulfillment_mode !== "pickup_only" && validComplexes.length === 0) {
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

  // 상품 재고상한이 이미 예약된 수량보다 적게 줄어드는지 검증 (기존 상품만 해당)
  for (const p of products || []) {
    if (!p.id) continue;
    const { data: existing } = await supabase
      .from("products")
      .select("stock_reserved")
      .eq("id", p.id)
      .single();
    if (existing && p.stockLimit < existing.stock_reserved) {
      return NextResponse.json(
        { error: `상품 재고상한은 이미 예약된 수량(${existing.stock_reserved}개)보다 적게 설정할 수 없습니다.` },
        { status: 400 }
      );
    }
  }

  // 상품 삭제 (주문이력 없는 상품만 - DB 함수가 원자적으로 검증)
  for (const productId of deletedProductIds || []) {
    const { error: delError } = await supabase.rpc("delete_product_if_unordered", {
      p_product_id: productId,
    });
    if (delError) {
      return NextResponse.json(
        { error: "이미 주문이 들어간 상품은 삭제할 수 없습니다." },
        { status: 409 }
      );
    }
  }

  const remainingCount =
    (products || []).length; // 클라이언트가 삭제 예정 상품은 이미 목록에서 제외해서 보냄
  if (remainingCount === 0 || remainingCount > 3) {
    return NextResponse.json({ error: "상품은 1~3개까지 등록 가능합니다." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      title,
      bank_name: bankName,
      account_number: normalizePhone(accountNumber),
      account_holder: accountHolder,
      inquiry_url: inquiryUrl || null,
      start_at: startAt || null,
      close_deadline: closeDeadline || null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "공구 수정에 실패했습니다." }, { status: 500 });
  }

  // 단지 목록 전체 교체
  await supabase.from("campaign_complexes").delete().eq("campaign_id", id);
  const { error: complexError } = await supabase.from("campaign_complexes").insert(
    validComplexes.map((name, idx) => ({
      campaign_id: id,
      name,
      display_order: idx,
    }))
  );

  if (complexError) {
    return NextResponse.json({ error: "단지 목록 저장에 실패했습니다." }, { status: 500 });
  }

  // 상품 정보 수정/추가 (id 있으면 수정, 없으면 신규 - 주문이력 없는 상품만 자유롭게
  // 추가/수정 가능하고, 이미 주문 들어간 상품은 이름/가격 등은 그대로 두고 판매중지만 토글)
  if (products) {
    for (const [idx, p] of products.entries()) {
      if (p.id) {
        await supabase
          .from("products")
          .update({
            name: p.name,
            price: p.price,
            stock_limit: p.stockLimit,
            max_per_person: p.maxPerPerson ?? null,
            is_active: p.isActive ?? true,
            display_order: idx,
          })
          .eq("id", p.id);
      } else {
        await supabase.from("products").insert({
          campaign_id: id,
          name: p.name,
          price: p.price,
          stock_limit: p.stockLimit,
          max_per_person: p.maxPerPerson ?? null,
          is_active: true,
          display_order: idx,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
