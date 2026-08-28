import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 전화번호 원본은 저장하지 않으므로(HMAC 해시만 보관), 화면에는 마지막으로
// 노쇼 처리됐던 주문의 닉네임으로 어떤 사람인지 구분해서 보여준다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: groups, error } = await supabase.rpc("list_noshow_groups", {
    p_owner_id: user.id,
  });
  if (error) {
    return NextResponse.json({ error: "노쇼 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows =
    (groups ?? []) as {
      phone_hash: string;
      active_count: number;
      last_order_id: string | null;
      last_created_at: string;
    }[];

  const orderIds = rows.map((g) => g.last_order_id).filter((v): v is string => !!v);
  let nicknameMap: Record<string, string> = {};
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, nickname")
      .in("id", orderIds);
    nicknameMap = Object.fromEntries((orders ?? []).map((o) => [o.id, o.nickname]));
  }

  const result = rows.map((g) => ({
    phoneHash: g.phone_hash,
    activeCount: g.active_count,
    lastNickname: g.last_order_id ? nicknameMap[g.last_order_id] ?? "알 수 없음" : "알 수 없음",
    lastAt: g.last_created_at,
  }));

  return NextResponse.json({ groups: result });
}
