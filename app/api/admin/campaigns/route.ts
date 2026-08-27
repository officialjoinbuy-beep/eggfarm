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
    closeDeadline,
    complexes,
    products,
  } = body as {
    title: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    inquiryUrl?: string;
    closeDeadline?: string; // ISO datetime string, optional
    complexes: string[];
    products: { name: string; price: number; stockLimit: number; imageUrl?: string }[];
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
  const validComplexes = (complexes || []).map((c) => c.trim()).filter(Boolean);
  if (validComplexes.length === 0) {
    return NextResponse.json(
      { error: "배송 가능한 아파트 단지를 1개 이상 등록해주세요." },
      { status: 400 }
    );
  }
  if (closeDeadline && new Date(closeDeadline).getTime() <= Date.now()) {
    return NextResponse.json({ error: "마감일시는 현재보다 미래여야 합니다." }, { status: 400 });
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
      close_deadline: closeDeadline || null,
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
