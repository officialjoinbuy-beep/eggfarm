"use client";

import { useEffect, useRef, useState } from "react";

type CardItem = { icon: string; title: string; desc: string };

// 모바일 전용 자동 슬라이드 캐러셀. sm 이상 화면에서는 렌더링하지 않음(그리드 버전 사용).
// 몇 초 간격으로 자동으로 다음 카드로 넘어가고, 사용자가 직접 스와이프하면
// 잠시 자동 넘김을 멈췄다가 다시 재개한다.
export default function AutoCarousel({
  items,
  variant = "plain",
}: {
  items: CardItem[];
  variant?: "plain" | "bordered";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % items.length;
        const el = trackRef.current;
        if (el) {
          el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        }
        return next;
      });
    }, 3200);
    return () => clearInterval(t);
  }, [paused, items.length]);

  function handleScroll() {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 5000);
  }

  const cardClass =
    variant === "bordered"
      ? "border border-neutral-200 rounded-xl p-5"
      : "bg-neutral-50 rounded-xl p-5 text-center";

  return (
    <div className="sm:hidden">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory -mx-5 px-5 gap-3 scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item) => (
          <div key={item.title} className={`flex-shrink-0 w-full snap-center ${cardClass}`}>
            <p className={variant === "bordered" ? "text-[20px] mb-2" : "text-[22px] mb-2"}>
              {item.icon}
            </p>
            <p className="text-[14px] font-medium mb-1">{item.title}</p>
            <p className="text-[13px] text-neutral-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-3">
        {items.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-4 bg-neutral-800" : "w-1.5 bg-neutral-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
