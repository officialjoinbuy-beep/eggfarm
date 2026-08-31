"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatWon } from "@/lib/format";

type CampaignInfo = {
  id: string;
  title: string;
  start_at: string | null;
  close_deadline: string | null;
  closed_at: string | null;
  is_closed: boolean;
  created_at: string;
  fulfillment_mode?: "pickup_only" | "delivery_only" | "hybrid";
  stale_pickup_count?: number;
};

const MODE_EMOJI: Record<string, string> = {
  pickup_only: "🏢",
  delivery_only: "🚚",
  hybrid: "🏢🚚",
};

type DayInfo = {
  date: Date;
  inMonth: boolean;
  items: { campaign: CampaignInfo; status: "upcoming" | "active" | "completed" }[];
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function AdminCalendar({
  onRegenerate,
  regenerating,
}: {
  onRegenerate?: (campaignId: string) => void;
  regenerating?: boolean;
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthDeliveredCount, setMonthDeliveredCount] = useState(0);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function load(monthDate: Date) {
    setLoading(true);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const res = await fetch(`/api/admin/campaigns/calendar?month=${monthStr}`);
    if (res.ok) {
      const data = await res.json();
      setMonthRevenue(data.monthRevenue ?? 0);
      setMonthDeliveredCount(data.monthDeliveredCount ?? 0);
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(cursor);
    setSelectedDate(null);
  }, [cursor.getFullYear(), cursor.getMonth()]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-indexed
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());

  const days: DayInfo[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(year, month, 1 - (startWeekday - i));
    days.push({ date: d, inMonth: false, items: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(year, month, d), inMonth: true, items: [] });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false, items: [] });
  }

  // 각 공구를 상태별로 관련 날짜에 배치
  for (const c of campaigns) {
    const startAt = c.start_at ? startOfDay(new Date(c.start_at)) : startOfDay(new Date(c.created_at));
    const isUpcoming = c.start_at && new Date(c.start_at).getTime() > Date.now();
    const isCompleted = c.is_closed;

    if (isCompleted) {
      const endDate = c.closed_at
        ? startOfDay(new Date(c.closed_at))
        : c.close_deadline
        ? startOfDay(new Date(c.close_deadline))
        : startAt;
      const day = days.find((d) => ymd(d.date) === ymd(endDate));
      if (day) day.items.push({ campaign: c, status: "completed" });
    } else if (isUpcoming) {
      const day = days.find((d) => ymd(d.date) === ymd(startAt));
      if (day) day.items.push({ campaign: c, status: "upcoming" });
    } else {
      // 진행중: 시작일 ~ (마감일 또는 오늘) 매일 표시
      const endDate = c.close_deadline
        ? startOfDay(new Date(c.close_deadline))
        : today;
      for (const day of days) {
        if (day.date.getTime() >= startAt.getTime() && day.date.getTime() <= endDate.getTime()) {
          day.items.push({ campaign: c, status: "active" });
        }
      }
    }
  }

  function changeMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const selectedDay = days.find((d) => selectedDate && ymd(d.date) === selectedDate);

  const statusColor: Record<string, string> = {
    upcoming: "bg-amber-400",
    active: "bg-green-500",
    completed: "bg-neutral-400",
  };

  return (
    <div className="mb-5">
      <div className="bg-neutral-50 border rounded-xl p-4 mb-3">
        <p className="text-[12px] text-neutral-500 mb-1">
          {year}년 {month + 1}월 완료 매출
        </p>
        <p className="text-[22px] font-semibold">{formatWon(monthRevenue)}</p>
        <p className="text-[11px] text-neutral-400 mt-0.5">배송완료 {monthDeliveredCount}건 기준</p>
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={() => changeMonth(-1)} className="text-[13px] px-2 py-1">
          ← 이전달
        </button>
        <p className="text-[14px] font-medium">
          {year}년 {month + 1}월
        </p>
        <button onClick={() => changeMonth(1)} className="text-[13px] px-2 py-1">
          다음달 →
        </button>
      </div>

      <div className="flex gap-3 text-[11px] text-neutral-500 mb-2">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 진행예정
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 진행중
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-neutral-400 inline-block" /> 진행완료
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-400 mb-1">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const isToday = ymd(d.date) === ymd(today);
          const dateStr = ymd(d.date);
          const uniqueStatuses = Array.from(new Set(d.items.map((i) => i.status)));
          return (
            <button
              key={idx}
              onClick={() => d.items.length > 0 && setSelectedDate(dateStr)}
              className={`aspect-square rounded flex flex-col items-center justify-center text-[11px] ${
                d.inMonth ? "text-neutral-800" : "text-neutral-300"
              } ${isToday ? "border border-neutral-900" : ""} ${
                selectedDate === dateStr ? "bg-neutral-200" : ""
              }`}
            >
              <span>{d.date.getDate()}</span>
              {uniqueStatuses.length > 0 && (
                <span className="flex gap-0.5 mt-0.5">
                  {uniqueStatuses.map((s) => (
                    <span key={s} className={`w-1.5 h-1.5 rounded-full ${statusColor[s]}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && selectedDay.items.length > 0 && (
        <div className="mt-3 border rounded-lg p-3 bg-white">
          <p className="text-[12px] text-neutral-500 mb-2">
            {selectedDay.date.getMonth() + 1}월 {selectedDay.date.getDate()}일
          </p>
          <div className="flex flex-col gap-2">
            {selectedDay.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between border rounded-lg p-2.5"
              >
                <button
                  onClick={() => router.push(`/admin/${item.campaign.id}`)}
                  className="text-left flex items-center gap-2 min-w-0 flex-1"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor[item.status]}`} />
                  <span className="text-[13px] truncate">
                    {item.campaign.fulfillment_mode ? MODE_EMOJI[item.campaign.fulfillment_mode] + " " : ""}
                    {item.campaign.title}
                    {!!item.campaign.stale_pickup_count && (
                      <span className="ml-1 text-[10px] text-amber-600">
                        미수령 {item.campaign.stale_pickup_count}건
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {item.status === "completed" && onRegenerate && (
                    <button
                      onClick={() => onRegenerate(item.campaign.id)}
                      disabled={regenerating}
                      className="text-[11px] text-neutral-500 border rounded px-2 py-1 disabled:opacity-50"
                    >
                      재생성
                    </button>
                  )}
                  <span className="text-[11px] text-neutral-400">
                    {item.status === "upcoming" ? "예정" : item.status === "active" ? "진행중" : "완료"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
