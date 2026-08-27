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

// 숫자 문자열에 천단위 콤마 삽입 (가격 입력창 실시간 표시용)
export function formatNumberWithCommas(digits: string): string {
  const d = digits.replace(/[^0-9]/g, "");
  if (!d) return "";
  return Number(d).toLocaleString("ko-KR");
}

// 계좌번호에 4자리 단위로 하이픈 삽입. 단, 15자리인 경우만 4-4-4-3 형식.
export function formatAccountNumber(input: string): string {
  const d = input.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 15) {
    return [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12), d.slice(12, 15)]
      .filter(Boolean)
      .join("-");
  }
  const groups: string[] = [];
  for (let i = 0; i < d.length; i += 4) {
    groups.push(d.slice(i, i + 4));
  }
  return groups.join("-");
}
