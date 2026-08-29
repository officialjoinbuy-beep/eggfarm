import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptStaffField, maskName, maskPhone } from "@/lib/staff-crypto";

// 관리자 홈 상단 "위임 현황" 배너용 - 살아있는(무효화 안됐고 만료 안된)
// 위임배송 링크는 마감 후 최대 2일 이내인 공구에만 존재할 수 있어, 이 목록은
// 자연스럽게 "지금 당장 신경써야 할 것들"만 남는다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: links, error } = await supabase.rpc("list_active_delegations", {
    p_owner_id: user.id,
  });
  if (error) {
    return NextResponse.json({ error: "위임 현황을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows =
    (links ?? []) as {
      link_id: string;
      campaign_id: string;
      campaign_title: string;
      complex_ids: string[];
      staff_id: string | null;
      expires_at: string;
    }[];

  const campaignIds = Array.from(new Set(rows.map((r) => r.campaign_id)));
  const staffIds = Array.from(new Set(rows.map((r) => r.staff_id).filter(Boolean))) as string[];

  const [{ data: complexes }, { data: staff }] = await Promise.all([
    supabase.from("campaign_complexes").select("id, name").in("campaign_id", campaignIds),
    staffIds.length > 0
      ? supabase.from("delivery_staff").select("id, name_enc, phone_enc").in("id", staffIds)
      : Promise.resolve({ data: [] as { id: string; name_enc: string; phone_enc: string }[] }),
  ]);

  const complexNameById = Object.fromEntries((complexes ?? []).map((c) => [c.id, c.name]));
  const staffById = Object.fromEntries(
    (staff ?? []).map((s) => [
      s.id,
      { name: maskName(decryptStaffField(s.name_enc)), phone: maskPhone(decryptStaffField(s.phone_enc)) },
    ])
  );

  const delegations = rows.map((r) => ({
    linkId: r.link_id,
    campaignId: r.campaign_id,
    campaignTitle: r.campaign_title,
    complexNames: r.complex_ids.map((cid) => complexNameById[cid]).filter(Boolean),
    staff: r.staff_id ? staffById[r.staff_id] ?? null : null,
    expiresAt: r.expires_at,
  }));

  return NextResponse.json({ delegations });
}
