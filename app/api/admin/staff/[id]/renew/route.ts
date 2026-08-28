import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

  const nextDec31 = new Date(new Date().getFullYear() + 1, 11, 31, 23, 59, 59);

  const { error } = await supabase
    .from("delivery_staff")
    .update({ retention_expires_at: nextDec31.toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: "연장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
