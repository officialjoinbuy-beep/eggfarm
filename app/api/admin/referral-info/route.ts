import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data } = await supabase
    .from("account_limits")
    .select("referral_code")
    .eq("owner_id", user.id)
    .single();

  return NextResponse.json({ referralCode: data?.referral_code ?? null });
}
