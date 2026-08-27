"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CampaignForm from "@/components/CampaignForm";

type Campaign = {
  id: string;
  title: string;
  is_closed: boolean;
  close_deadline: string | null;
  closed_at: string | null;
  order_count: number;
};

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CampaignListClient() {
  const router = useRouter();
  const [active, setActive] = useState<Campaign[]>([]);
  const [closed, setClosed] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/campaigns/mine");
    if (res.ok) {
      const data = await res.json();
      setActive(data.active ?? []);
      setClosed(data.closed ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function goTo(id: string) {
    router.push(`/admin/${id}`);
  }

  return (
    <div>
      <p className="text-[16px] font-semibold mb-1">내 공구 목록</p>
      <p className="text-[12px] text-neutral-500 mb-4">
        진행중 공구는 마감일시가 가까운 순, 마감된 공구는 최근 마감순으로 표시됩니다
      </p>

      {loading ? (
        <p className="text-center text-neutral-400 text-[13px] py-10">불러오는 중...</p>
      ) : (
        <>
          <p className="text-[12px] text-neutral-500 mb-2">
            진행중 <span className="text-neutral-400">{active.length}</span>
          </p>
          <div className="flex flex-col gap-2 mb-5">
            {active.length === 0 && (
              <p className="text-[13px] text-neutral-400 py-2">진행중인 공구가 없습니다.</p>
            )}
            {active.map((c) => (
              <button
                key={c.id}
                onClick={() => goTo(c.id)}
                className="text-left bg-neutral-50 border rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-[13px] font-medium">{c.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    주문 {c.order_count}건
                    {c.close_deadline && ` · ${formatDeadline(c.close_deadline)} 마감`}
                  </p>
                </div>
                <span className="text-[12px] text-neutral-400">보기 →</span>
              </button>
            ))}
          </div>

          {closed.length > 0 && (
            <>
              <p className="text-[12px] text-neutral-500 mb-2">
                마감됨 <span className="text-neutral-400">{closed.length}</span>
              </p>
              <div className="flex flex-col gap-2 mb-5">
                {closed.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => goTo(c.id)}
                    className="text-left bg-neutral-50 border rounded-lg p-3 flex items-center justify-between opacity-70"
                  >
                    <div>
                      <p className="text-[13px] font-medium">{c.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        주문 {c.order_count}건
                        {c.closed_at && ` · ${formatDeadline(c.closed_at)} 마감됨`}
                      </p>
                    </div>
                    <span className="text-[12px] text-neutral-400">보기 →</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showForm ? (
        <CampaignForm
          onCreated={(id) => goTo(id)}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed rounded-lg py-2.5 text-[13px] text-neutral-500"
        >
          + 새 공구 만들기
        </button>
      )}
    </div>
  );
}
