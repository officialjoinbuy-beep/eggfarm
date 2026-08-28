import { createAdminClient } from "@/lib/supabase/admin";

export async function validateStaffLink(token: string) {
  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from("delivery_staff_links")
    .select("id, campaign_id, complex_ids, fee_per_order, expires_at, revoked, staff_id")
    .eq("token", token)
    .single();

  if (!link) return { error: "유효하지 않은 링크입니다." as const };
  if (link.revoked) return { error: "만료되었거나 무효화된 링크입니다." as const };
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { error: "링크 유효기간이 지났습니다." as const };
  }

  // 담당 단지명 목록 조회 (order.complex_name과 대조하기 위함)
  const { data: complexes } = await supabase
    .from("campaign_complexes")
    .select("id, name")
    .in("id", link.complex_ids);

  const allowedNames = (complexes ?? []).map((c) => c.name);

  return { link, allowedNames };
}
