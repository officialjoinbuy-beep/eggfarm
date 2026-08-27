import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { error } = await supabase
    .from("delivery_staff_links")
    .update({ revoked: true })
    .eq("id", linkId);

  if (error) {
    return NextResponse.json({ error: "무효화에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
