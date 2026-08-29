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

  const { data: staff } = await supabase.rpc("list_staff_with_last_fee", {
    p_owner_id: user.id,
  });

  // 현재 살아있는(무효화 안됐고 만료 안된) 위임배송 링크 기준으로,
  // 담당자별 담당 단지명 목록을 만든다.
  const { data: delegations } = await supabase.rpc("list_active_delegations", {
    p_owner_id: user.id,
  });
  const allComplexIds = Array.from(
    new Set(
      ((delegations ?? []) as { complex_ids: string[] }[]).flatMap((d) => d.complex_ids || [])
    )
  );
  let complexIdToName: Record<string, string> = {};
  if (allComplexIds.length > 0) {
    const { data: complexRows } = await supabase
      .from("campaign_complexes")
      .select("id, name")
      .in("id", allComplexIds);
    complexIdToName = Object.fromEntries(
      (complexRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    );
  }
  const staffIdToComplexNames: Record<string, Set<string>> = {};
  for (const d of (delegations ?? []) as { staff_id: string; complex_ids: string[] }[]) {
    if (!staffIdToComplexNames[d.staff_id]) staffIdToComplexNames[d.staff_id] = new Set();
    for (const cid of d.complex_ids || []) {
      const name = complexIdToName[cid];
      if (name) staffIdToComplexNames[d.staff_id].add(name);
    }
  }

  const result = (
    (staff ?? []) as {
      id: string;
      name_enc: string;
      phone_enc: string;
      retention_expires_at: string;
      created_at: string;
      last_fee_per_order: number | null;
    }[]
  ).map((s) => {
    const name = decryptStaffField(s.name_enc);
    const phone = decryptStaffField(s.phone_enc);
    return {
      id: s.id,
      name: reveal ? name : maskName(name),
      phone: reveal ? phone : maskPhone(phone),
      retention_expires_at: s.retention_expires_at,
      created_at: s.created_at,
      lastFeePerOrder: s.last_fee_per_order ?? null,
      assignedComplexNames: Array.from(staffIdToComplexNames[s.id] ?? []),
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
