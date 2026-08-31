import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from("account_limits")
    .select("kakao_refresh_token")
    .eq("owner_id", user.id)
    .single();

  return NextResponse.json({ connected: !!data?.kakao_refresh_token });
}
