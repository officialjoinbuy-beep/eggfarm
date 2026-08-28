import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

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

  const { data: links } = await supabase
    .from("delivery_staff_links")
    .select("id, token, complex_ids, fee_per_order, expires_at, revoked, created_at, staff_id")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ links: links ?? [] });
}

// 공구 마감일(또는 없으면 오늘) 기준 +2일 자정 만료
function computeExpiry(closeDeadline: string | null): Date {
  const base = closeDeadline ? new Date(closeDeadline) : new Date();
  const expiry = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2, 0, 0, 0, 0);
  return expiry;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { complexIds, feePerOrder, staffId } = (await req.json()) as {
    complexIds: string[];
    feePerOrder: number;
    staffId: string;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!complexIds || complexIds.length === 0) {
    return NextResponse.json({ error: "담당할 단지를 1개 이상 선택해주세요." }, { status: 400 });
  }
  if (!staffId) {
    return NextResponse.json({ error: "배송담당자를 선택하거나 등록해주세요." }, { status: 400 });
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("close_deadline")
    .eq("id", id)
    .single();

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = computeExpiry(campaign?.close_deadline ?? null);

  const { data: link, error } = await supabase
    .from("delivery_staff_links")
    .insert({
      campaign_id: id,
      token,
      complex_ids: complexIds,
      fee_per_order: feePerOrder || 0,
      staff_id: staffId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token, expires_at")
    .single();

  if (error || !link) {
    return NextResponse.json({ error: "링크 생성에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ link });
}
