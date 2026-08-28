// 배송담당자 검색용 - 이름을 (1) 그대로 (2) 초성만(예: ㄱㅊㅅ, 부분 ㅊㅅ도 매칭)
// (3) 영타로 잘못 입력된 경우(예: rlacjftn -> 김철수)까지 매칭해준다.
// 정확한 국어 로마자 표기 변환기가 아니라, 실무에서 "이 정도면 충분히 찾아진다"
// 수준의 근사 매칭이다(겹모음/겹받침 조합, 쌍자음 등은 지원하지 않음).

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ",
  "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ",
  "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// 이름 문자열에서 각 음절의 초성만 뽑아 이어붙인 문자열 반환 (예: "김철수" -> "ㄱㅊㅅ")
export function getChosung(str: string): string {
  let result = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) {
      result += CHO[Math.floor(code / (21 * 28))];
    }
  }
  return result;
}

// 두벌식 표준 자판 매핑 (소문자만 지원 - 쌍자음/이중모음 shift 입력은 지원하지 않음)
const QWERTY_TO_JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ",
  y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ",
  h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
};

// 영타(qwerty)로 잘못 입력된 문자열을 한글 자모 배열로 변환
function toJamoSequence(qwerty: string): string[] | null {
  const jamos: string[] = [];
  for (const ch of qwerty.toLowerCase()) {
    const j = QWERTY_TO_JAMO[ch];
    if (!j) return null; // 매핑 안 되는 글자가 있으면 변환 포기
    jamos.push(j);
  }
  return jamos;
}

// 자모 배열을 완성된 한글 음절 문자열로 조합 (1글자 앞을 내다보며 종성 여부 판단)
function composeHangul(jamos: string[]): string {
  let result = "";
  let i = 0;
  while (i < jamos.length) {
    const c1 = jamos[i];
    if (!CHO.includes(c1)) {
      result += c1;
      i += 1;
      continue;
    }
    const v = jamos[i + 1];
    if (v && JUNG.includes(v)) {
      let jong = "";
      let consumed = 2;
      const maybeJong = jamos[i + 2];
      const afterJong = jamos[i + 3];
      if (
        maybeJong &&
        CHO.includes(maybeJong) &&
        JONG.includes(maybeJong) &&
        !(afterJong && JUNG.includes(afterJong))
      ) {
        jong = maybeJong;
        consumed = 3;
      }
      const choIdx = CHO.indexOf(c1);
      const jungIdx = JUNG.indexOf(v);
      const jongIdx = jong ? JONG.indexOf(jong) : 0;
      result += String.fromCharCode(0xac00 + choIdx * 21 * 28 + jungIdx * 28 + jongIdx);
      i += consumed;
    } else {
      result += c1;
      i += 1;
    }
  }
  return result;
}

// 검색어가 초성만으로 이루어져 있는지 (예: "ㄱㅊㅅ", "ㅊㅅ")
function isChosungOnly(q: string): boolean {
  return q.length > 0 && [...q].every((c) => CHO.includes(c));
}

// name이 query와 매칭되는지: 그대로 포함 / 초성 부분일치 / 영타 오타 변환 순서로 확인
export function matchesKoreanName(name: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (name.includes(q)) return true;

  if (isChosungOnly(q)) {
    return getChosung(name).includes(q);
  }

  if (/^[a-z]+$/i.test(q)) {
    const jamos = toJamoSequence(q);
    if (jamos) {
      const composed = composeHangul(jamos);
      if (composed && name.includes(composed)) return true;
    }
  }

  return false;
}
