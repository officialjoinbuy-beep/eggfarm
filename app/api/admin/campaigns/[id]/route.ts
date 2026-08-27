import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";

// 진행자가 공구 상세정보(수정 화면)를 불러올 때 사용.
// 상품 정보는 이미 /orders 라우트에서 가져오고 있으므로 여기선 공구 자체 정보 + 단지 목록만 반환.
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
      "id, title, bank_name, account_number, account_holder, inquiry_url, start_at, close_deadline, is_closed"
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

  return NextResponse.json({ campaign, complexes: complexes ?? [] });
}

// 진행중인 공구도 정보 수정 가능 (제목/계좌/마감일시/문의링크/배송가능 단지 목록).
// 단지 목록은 기존 것을 전부 지우고 새 목록으로 교체한다. 과거 주문에는
// 주문 당시 단지명이 텍스트로 그대로 저장되어 있어(complex_name) 영향 없음.
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
  } = body as {
    title: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    inquiryUrl?: string;
    startAt?: string | null;
    closeDeadline?: string | null;
    complexes: string[];
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
  if (startAt && closeDeadline && new Date(startAt).getTime() >= new Date(closeDeadline).getTime()) {
    return NextResponse.json({ error: "시작일시는 마감일시보다 이전이어야 합니다." }, { status: 400 });
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

  return NextResponse.json({ ok: true });
}
