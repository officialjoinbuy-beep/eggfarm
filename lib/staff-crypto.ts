import crypto from "crypto";

// 배송담당자 이름/연락처는 실제로 연락하고 정산해야 하는 정보라 노쇼 해시처럼
// 일방향으로 만들 수 없다. 대신 AES-256-GCM으로 암호화해 DB에 저장하고,
// 화면에 보여줄 때만 서버에서 복호화한다. DB가 통째로 유출되어도 이 키
// (STAFF_ENC_KEY, 서버 환경변수)가 없으면 원문을 복원할 수 없다.
const KEY_HEX = process.env.STAFF_ENC_KEY || "0".repeat(64); // 개발용 폴백(운영에서는 반드시 환경변수 설정)
const KEY = Buffer.from(KEY_HEX, "hex");

export function encryptStaffField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptStaffField(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// 화면 기본 표시용 마스킹 (예: 010-****-5678, 홍*동)
export function maskPhone(phone: string): string {
  const d = phone.replace(/[^0-9]/g, "");
  if (d.length < 8) return phone;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}
