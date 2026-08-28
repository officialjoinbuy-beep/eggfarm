import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptStaffField, maskName, maskPhone } from "@/lib/staff-crypto";

// month: "YYYY-MM" (없으면 이번달)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const monthParam = req.nextUrl.searchParams.get("month");
  const now = new Date();
  const [year, month] = monthParam
    ? monthParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const monthStart = new Date(year, month - 1, 1);
  const monthEndExclusive = new Date(year, month, 1);

  const { data: staffList } = await supabase
    .from("delivery_staff")
    .select("id, name_enc, phone_enc")
    .eq("owner_id", user.id);

  if (!staffList || staffList.length === 0) {
    return NextResponse.json({ settlements: [] });
  }

  // 본인 소유 공구에서, 이번달에 이 담당자들이 완료한 건 조회
  const { data: orders } = await supabase
    .from("orders")
    .select("completed_by_staff_id, staff_fee_amount, delivery_completed_at, campaigns!inner(owner_id)")
    .eq("campaigns.owner_id", user.id)
    .not("completed_by_staff_id", "is", null)
    .gte("delivery_completed_at", monthStart.toISOString())
    .lt("delivery_completed_at", monthEndExclusive.toISOString());

  const settlements = staffList.map((s) => {
    const staffOrders = (orders ?? []).filter((o) => o.completed_by_staff_id === s.id);
    const count = staffOrders.length;
    const amount = staffOrders.reduce((sum, o) => sum + (o.staff_fee_amount || 0), 0);
    return {
      id: s.id,
      name: maskName(decryptStaffField(s.name_enc)),
      phone: maskPhone(decryptStaffField(s.phone_enc)),
      completedCount: count,
      settlementAmount: amount,
    };
  });

  return NextResponse.json({ settlements });
}
