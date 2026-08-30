import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "console_session";

function expectedToken(): string | null {
  const pw = process.env.CONSOLE_ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHash("sha256").update(pw).digest("hex");
}

export async function isConsoleAuthed(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false; // 비밀번호 미설정 시 항상 차단
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === expected;
}

export function consoleCookieName() {
  return COOKIE_NAME;
}

export function consoleExpectedToken() {
  return expectedToken();
}
