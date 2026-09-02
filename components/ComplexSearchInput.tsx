"use client";

import { useEffect, useRef, useState } from "react";

type Candidate = { kakaoPlaceId: string; name: string; address: string };

// 아파트 단지명을 입력하면 카카오맵 검색 결과(도로명주소 포함)를 보여주고
// 그중 정확한 곳을 선택하게 한다. 같은 이름의 아파트가 여러 동네에 있어도
// 주소로 구분할 수 있다. 목록에 원하는 곳이 없으면 입력한 이름을 그대로
// 수동 등록할 수도 있다(이 경우 주소는 비워둔 채 저장됨).
export default function ComplexSearchInput({
  name,
  address,
  onChange,
}: {
  name: string;
  address: string | null;
  onChange: (value: { name: string; address: string | null; kakaoPlaceId: string | null }) => void;
}) {
  const [query, setQuery] = useState(name);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(name), [name]);

  function handleInput(value: string) {
    setQuery(value);
    onChange({ name: value, address: null, kakaoPlaceId: null }); // 직접 타이핑 시 주소는 초기화
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setCandidates([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/kakao/local-search?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setCandidates(data.results ?? []);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function select(c: Candidate) {
    setQuery(c.name);
    onChange({ name: c.name, address: c.address, kakaoPlaceId: c.kakaoPlaceId });
    setOpen(false);
    setCandidates([]);
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        className="w-full border rounded px-2 py-1.5 text-sm"
        placeholder="아파트 단지명 검색"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => candidates.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {address && <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{address}</p>}
      {open && (loading || candidates.length > 0) && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-lg shadow-sm max-h-52 overflow-y-auto">
          {loading && <p className="text-[12px] text-neutral-400 px-3 py-2">검색 중...</p>}
          {!loading &&
            candidates.map((c) => (
              <button
                key={c.kakaoPlaceId}
                type="button"
                onMouseDown={() => select(c)}
                className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b last:border-b-0"
              >
                <p className="text-[13px] font-medium">{c.name}</p>
                <p className="text-[11px] text-neutral-400">{c.address}</p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
