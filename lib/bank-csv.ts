// 은행 앱에서 내려받은 거래내역 CSV를 파싱해 "입금자명 + 금액" 목록으로
// 표준화한다. 은행마다 컬럼 이름/순서가 달라서, 지원 은행 목록에 있는
// 컬럼명 패턴을 순서대로 시도해보고 맞는 걸 찾는 방식으로 동작한다.
// 새 은행을 지원하려면 SUPPORTED_BANKS 배열에 컬럼명 패턴만 추가하면 된다.

export type BankFormat = {
  bankName: string;
  // CSV 헤더에 아래 후보 중 하나라도 포함되면 그 은행 포맷으로 인식한다.
  depositorHeaderCandidates: string[];
  amountHeaderCandidates: string[];
  // 입금(+)/출금(-)이 한 컬럼에 같이 있는 은행은 amountHeaderCandidates가
  // 음수도 반환할 수 있음 - 파싱 후 amount > 0인 것만 입금으로 취급한다.
};

// 지금 지원하는 은행 목록 - 화면에 이 이름 그대로 안내 문구로 노출된다.
export const SUPPORTED_BANKS: BankFormat[] = [
  {
    bankName: "카카오뱅크",
    depositorHeaderCandidates: ["보낸분", "적요", "거래메모"],
    amountHeaderCandidates: ["입금액", "거래금액"],
  },
  {
    bankName: "국민은행",
    depositorHeaderCandidates: ["보낸분/받는분", "내용", "적요"],
    amountHeaderCandidates: ["입금액", "거래금액"],
  },
  {
    bankName: "신한은행",
    depositorHeaderCandidates: ["보낸분", "적요"],
    amountHeaderCandidates: ["입금", "거래금액"],
  },
];

export type ParsedTransaction = { depositorRaw: string; amount: number };

// 주문의 "추천 입금자명"(전화번호에서 010 뺀 뒷자리)과 동일한 규칙으로
// CSV의 입금자명 텍스트에서 숫자만 뽑아 비교한다. 입금자명에 실명 대신
// 이 추천 번호를 그대로 넣은 경우 완전일치로 잡히고, 실명을 넣은 경우는
// 숫자가 없어 자동매칭되지 않아 수동 확인 목록으로 남는다(안내 문구로
// "가급적 추천 입금자명 그대로 입금해달라"고 요청하고 있어 대부분 커버됨).
export function extractDigits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}


// 아주 단순한 CSV 파서(따옴표로 감싼 필드, 콤마 이스케이프 정도만 처리).
// 은행 거래내역 CSV는 구조가 단순해서 papaparse 같은 라이브러리 없이도 충분하다.
function parseCsvLines(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  });
}

export function detectBankFormat(headerRow: string[]): BankFormat | null {
  for (const bank of SUPPORTED_BANKS) {
    const hasDepositor = bank.depositorHeaderCandidates.some((c) => headerRow.includes(c));
    const hasAmount = bank.amountHeaderCandidates.some((c) => headerRow.includes(c));
    if (hasDepositor && hasAmount) return bank;
  }
  return null;
}

export function parseBankCsv(text: string): { bank: BankFormat | null; transactions: ParsedTransaction[] } {
  const rows = parseCsvLines(text);
  if (rows.length < 2) return { bank: null, transactions: [] };

  const header = rows[0];
  const bank = detectBankFormat(header);
  if (!bank) return { bank: null, transactions: [] };

  const depositorIdx = header.findIndex((h) => bank.depositorHeaderCandidates.includes(h));
  const amountIdx = header.findIndex((h) => bank.amountHeaderCandidates.includes(h));

  const transactions: ParsedTransaction[] = [];
  for (const row of rows.slice(1)) {
    const depositorRaw = row[depositorIdx] ?? "";
    const amountText = (row[amountIdx] ?? "").replace(/[^0-9-]/g, "");
    const amount = Number(amountText);
    if (!depositorRaw || !amount || amount <= 0) continue;
    transactions.push({ depositorRaw, amount });
  }
  return { bank, transactions };
}
