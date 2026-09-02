import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 방금 가입한 이메일의 전화번호/추천인을 account_limits에 채워넣는다.
export async function POST(req: NextRequest) {
  const { email, phone, referralCode } = (await req.json()) as {
    email?: string;
    phone?: string;
    referralCode?: string | null;
  };
  if (!email || !phone) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = createAdminClient();

  let ownerId: string | null = null;
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const user = data?.users.find((u) => u.email === email);
    if (user) {
      ownerId = user.id;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ownerId) {
    return NextResponse.json({ error: "가입 처리 중입니다." }, { status: 202 });
  }

  let referredBy: string | null = null;
  if (referralCode) {
    const { data: referrer } = await supabase
      .from("account_limits")
      .select("owner_id")
      .eq("referral_code", referralCode)
      .maybeSingle();
    if (referrer && referrer.owner_id !== ownerId) referredBy = referrer.owner_id;
  }

  await supabase
    .from("account_limits")
    .update({ owner_phone: phone, referred_by: referredBy })
    .eq("owner_id", ownerId);

  return NextResponse.json({ ok: true });
}
