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

// 배송동선 정렬: 동(1순위, 자연스러운 순서) → 호수 내림차순(2순위, 높은 층부터)
// dong/unit_no가 없는 주문(현장픽업 등)은 맨 뒤로 보낸다.
export function sortByDongUnitDesc<T extends { dong?: string | null; unit_no?: string | null }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    if (!a.dong && !b.dong) return 0;
    if (!a.dong) return 1;
    if (!b.dong) return -1;
    const dongCompare = a.dong.localeCompare(b.dong, "ko", { numeric: true });
    if (dongCompare !== 0) return dongCompare;
    return (b.unit_no || "").localeCompare(a.unit_no || "", "ko", { numeric: true });
  });
}
// 현재 시각 기준 다음 정시를 { date: "YYYY-MM-DD", time: "HH:00" } 형태로 반환.
// 공구 시작일시 입력칸의 기본값으로 사용 (예: 12:55에 폼을 열면 13:00으로 세팅).
// 현재 시각 기준 가장 가까운 다음 15분 단위를 { date, time } 형태로 반환.
// 공구 시작일시 입력칸의 기본값으로 사용 (예: 3:36에 폼을 열면 3:45로 세팅).
export function next15Min(): { date: string; time: string } {
  const now = new Date();
  now.setSeconds(0, 0);
  const remainder = now.getMinutes() % 15;
  if (remainder !== 0 || now.getSeconds() > 0) {
    now.setMinutes(now.getMinutes() + (15 - remainder));
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { date, time };
}

// "14:30" -> "오후 2:30"
export function formatTimeKorean(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${String(m).padStart(2, "0")}`;
}

// 예상 수령시간대 입력값(from/to, 둘 다 선택)으로 안내 문구를 조합.
// 예: ("14:00", "18:00") -> "오후 2:00~오후 6:00", 하나만 있으면 "오후 2:00부터"
export function formatPickupTimeNote(from: string, to: string): string {
  if (from && to) return `${formatTimeKorean(from)}~${formatTimeKorean(to)}`;
  if (from) return `${formatTimeKorean(from)}부터`;
  if (to) return `${formatTimeKorean(to)}까지`;
  return "";
}
