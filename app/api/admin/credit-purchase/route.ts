import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshKakaoToken, sendKakaoMemo } from "@/lib/kakao";

const PACKAGES: Record<string, { credits: number; price: number }> = {
  "50회": { credits: 50, price: 29000 },
  "100회": { credits: 100, price: 49000 },
  "300회": { credits: 300, price: 119000 },
};

// 크레딧 구매 요청 접수 - 입금 확인 및 실제 한도 반영은 진행자가 수동으로 처리(재초대 방식).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { packageName } = (await req.json()) as { packageName?: string };
  const pkg = packageName ? PACKAGES[packageName] : null;
  if (!pkg) {
    return NextResponse.json({ error: "잘못된 패키지입니다." }, { status: 400 });
  }

  const { error } = await supabase.from("credit_purchase_requests").insert({
    owner_id: user.id,
    product_name: packageName,
    credit_amount: pkg.credits,
    price: pkg.price,
  });

  if (error) {
    return NextResponse.json({ error: "요청 접수에 실패했습니다." }, { status: 500 });
  }

  await notifyArinine(user.email || "알 수 없음", packageName as string, pkg.price, req.nextUrl.origin);

  return NextResponse.json({ ok: true });
}

// 진행자(ARININE) 본인에게 구매요청 접수를 카카오로 알림. 실패해도 요청 접수 자체는 성공 처리.
async function notifyArinine(email: string, packageName: string, price: number, origin: string) {
  const refreshToken = process.env.KAKAO_ADMIN_REFRESH_TOKEN;
  if (!refreshToken) return;
  try {
    const { access_token } = await refreshKakaoToken(refreshToken);
    await sendKakaoMemo(
      access_token,
      `크레딧 구매요청 접수: ${email} · ${packageName} · ${price.toLocaleString()}원. 콘솔에서 확인해주세요.`,
      `${origin}/console`
    );
  } catch (e) {
    console.error("진행자 카카오 알림 발송 실패(무시하고 계속):", e);
  }
}
