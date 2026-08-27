import crypto from "crypto";

// 노쇼 블랙리스트 대조용 전화번호 해시.
// - 같은 번호는 항상 같은 해시가 나와야 대조가 가능(고정 해시).
// - 서버만 아는 비밀키(HMAC)를 섞어서, 해시값만으로 원본 번호를 역산할 수 없게 한다.
// - PIN 저장에 쓰는 bcrypt(매번 다른 결과)와는 용도가 달라 별도 구현.
const SECRET = process.env.NOSHOW_HASH_SECRET || "dev-only-fallback-secret-change-me";

export function hashPhoneForNoshow(normalizedPhone: string): string {
  return crypto.createHmac("sha256", SECRET).update(normalizedPhone).digest("hex");
}
