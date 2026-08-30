import { NextRequest, NextResponse } from "next/server";
import { consoleCookieName, consoleExpectedToken } from "@/lib/console-auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  const expected = consoleExpectedToken();
  if (!expected) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 설정되지 않았습니다." },
      { status: 500 }
    );
  }
  if (!password || password !== process.env.CONSOLE_ADMIN_PASSWORD) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(consoleCookieName(), expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
