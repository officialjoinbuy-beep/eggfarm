import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("auto_renew_staff_retention");
  if (error) {
    return NextResponse.json({ error: "연장 처리 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
