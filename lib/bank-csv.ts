import * as XLSX from "xlsx";

// 은행 앱에서 내려받은 거래내역(CSV 또는 엑셀) 파일을 파싱해 "입금자명 + 금액"
// 목록으로 표준화한다. 은행마다 컬럼 이름/순서/표 시작 위치가 달라서, 지원
// 은행 목록에 있는 컬럼명 패턴을 파일 전체 행에서 찾아보는 방식으로 동작한다
// (예: 카카오뱅크는 안내문구 10줄 뒤 11행부터 실제 표가 시작됨).
// 새 은행을 지원하려면 SUPPORTED_BANKS 배열에 컬럼명 패턴만 추가하면 된다.

export type BankFormat = {
  bankName: string;
  // 헤더 행에 아래 후보 중 하나라도 포함되면 그 은행 포맷으로 인식한다.
  depositorHeaderCandidates: string[];
  amountHeaderCandidates: string[];
  // 입금/출금이 한 컬럼("구분" 등)으로 표시되는 은행은 이 컬럼값이 아래
  // depositLabel과 같은 행만 입금으로 취급한다. 없으면 금액이 양수인 행만 취급.
  typeHeaderCandidates?: string[];
  depositLabel?: string;
};

// 지금 지원하는 은행 목록 - 화면에 이 이름 그대로 안내 문구로 노출된다.
// 카카오뱅크는 실제 다운로드 파일(엑셀)로 확인된 컬럼명 기준.
export const SUPPORTED_BANKS: BankFormat[] = [
  {
    bankName: "카카오뱅크",
    depositorHeaderCandidates: ["내용", "메모"],
    amountHeaderCandidates: ["거래금액"],
    typeHeaderCandidates: ["구분"],
    depositLabel: "입금",
  },
  {
    bankName: "국민은행",
    depositorHeaderCandidates: ["내용", "적요"],
    amountHeaderCandidates: ["입금액", "거래금액"],
  },
  {
    bankName: "신한은행",
    depositorHeaderCandidates: ["적요", "내용"],
    amountHeaderCandidates: ["입금", "거래금액"],
  },
];

export type ParsedTransaction = { depositorRaw: string; amount: number };

// 주문의 "추천 입금자명"(전화번호에서 010 뺀 뒷자리)과 동일한 규칙으로
// 파일의 입금자명 텍스트에서 숫자만 뽑아 비교한다. 입금자명에 실명 대신
// 이 추천 번호를 그대로 넣은 경우 완전일치로 잡히고, 실명을 넣은 경우는
// 숫자가 없어 자동매칭되지 않아 수동 확인 목록으로 남는다.
export function extractDigits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

type Row = (string | number)[];

function toRows(buffer: ArrayBuffer): Row[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "" });
}

// 파일 전체를 훑으면서 우리가 아는 은행 포맷의 헤더 행을 찾는다.
// 안내문구가 표 위에 몇 줄 있어도(카카오뱅크처럼) 상관없이 찾아낸다.
function findHeaderRow(rows: Row[]): { bank: BankFormat; rowIndex: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => String(c).trim());
    for (const bank of SUPPORTED_BANKS) {
      const hasDepositor = bank.depositorHeaderCandidates.some((c) => cells.includes(c));
      const hasAmount = bank.amountHeaderCandidates.some((c) => cells.includes(c));
      if (hasDepositor && hasAmount) return { bank, rowIndex: i };
    }
  }
  return null;
}

export function parseBankFile(
  buffer: ArrayBuffer
): { bank: BankFormat | null; transactions: ParsedTransaction[] } {
  let rows: Row[];
  try {
    rows = toRows(buffer);
  } catch {
    return { bank: null, transactions: [] };
  }

  const found = findHeaderRow(rows);
  if (!found) return { bank: null, transactions: [] };
  const { bank, rowIndex } = found;

  const header = rows[rowIndex].map((c) => String(c).trim());
  const depositorIdx = header.findIndex((h) => bank.depositorHeaderCandidates.includes(h));
  const amountIdx = header.findIndex((h) => bank.amountHeaderCandidates.includes(h));
  const typeIdx = bank.typeHeaderCandidates
    ? header.findIndex((h) => bank.typeHeaderCandidates!.includes(h))
    : -1;

  const transactions: ParsedTransaction[] = [];
  for (const row of rows.slice(rowIndex + 1)) {
    const depositorRaw = String(row[depositorIdx] ?? "").trim();
    const amountText = String(row[amountIdx] ?? "").replace(/[^0-9-]/g, "");
    const amount = Number(amountText);
    if (!amount || amount <= 0) continue;
    if (typeIdx >= 0 && bank.depositLabel) {
      const typeVal = String(row[typeIdx] ?? "").trim();
      if (typeVal !== bank.depositLabel) continue;
    }
    if (!depositorRaw) continue;
    transactions.push({ depositorRaw, amount });
  }
  return { bank, transactions };
}
