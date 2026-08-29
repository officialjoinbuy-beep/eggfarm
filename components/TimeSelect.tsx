"use client";

// 브라우저 기본 time input의 step 속성이 기기별로 무시되는 문제를 피하기 위해
// 시(0~23)/분(00,15,30,45)을 직접 select로 구현한 시간 선택 컴포넌트.
// value/onChange는 기존 "HH:MM" 문자열 포맷을 그대로 유지해 다른 코드 변경을 최소화한다.
const MINUTES = ["00", "15", "30", "45"];

export default function TimeSelect({
  value,
  onChange,
  className = "",
}: {
  value: string; // "HH:MM" 또는 빈 문자열
  onChange: (value: string) => void;
  className?: string;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];

  function update(hour: string, minute: string) {
    if (hour === "" || minute === "") {
      onChange("");
      return;
    }
    onChange(`${hour.padStart(2, "0")}:${minute}`);
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <select
        className="flex-1 min-w-0 border rounded px-1.5 py-1.5 text-sm bg-white"
        value={h}
        onChange={(e) => update(e.target.value, m || "00")}
      >
        <option value="">시</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hh) => (
          <option key={hh} value={hh}>
            {hh}시
          </option>
        ))}
      </select>
      <select
        className="flex-1 min-w-0 border rounded px-1.5 py-1.5 text-sm bg-white"
        value={m}
        onChange={(e) => update(h || "00", e.target.value)}
      >
        <option value="">분</option>
        {MINUTES.map((mm) => (
          <option key={mm} value={mm}>
            {mm}분
          </option>
        ))}
      </select>
    </div>
  );
}
