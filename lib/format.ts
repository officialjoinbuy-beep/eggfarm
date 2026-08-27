// 연락처 입력값에서 숫자만 추출 (DB 저장용)
export function normalizePhone(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

// 숫자만 남은 연락처를 010-1234-5678 형태로 변환 (화면 표시용)
export function formatPhone(digits: string): string {
  const d = digits.replace(/[^0-9]/g, "");
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

export function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}
