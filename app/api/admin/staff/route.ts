import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptStaffField, decryptStaffField, maskName, maskPhone } from "@/lib/staff-crypto";
import { normalizePhone } from "@/lib/format";

function nextDec31(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31, 23, 59, 59);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const reveal = req.nextUrl.searchParams.get("reveal") === "1";

  const { data: staff } = await supabase
    .from("delivery_staff")
    .select("id, name_enc, phone_enc, retention_expires_at, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const result = (staff ?? []).map((s) => {
    const name = decryptStaffField(s.name_enc);
    const phone = decryptStaffField(s.phone_enc);
    return {
      id: s.id,
      name: reveal ? name : maskName(name),
      phone: reveal ? phone : maskPhone(phone),
      retention_expires_at: s.retention_expires_at,
      created_at: s.created_at,
    };
  });

  return NextResponse.json({ staff: result });
}

export async function POST(req: NextRequest) {
  const { name, phone } = await req.json();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!name || !phone) {
    return NextResponse.json({ error: "이름과 연락처를 입력해주세요." }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from("delivery_staff")
    .insert({
      owner_id: user.id,
      name_enc: encryptStaffField(name),
      phone_enc: encryptStaffField(normalizePhone(phone)),
      retention_expires_at: nextDec31().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ id: created.id });
}
