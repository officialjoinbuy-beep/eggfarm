"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CampaignForm from "@/components/CampaignForm";
import AdminCalendar from "./AdminCalendar";

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
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/campaigns/${deleteTarget.id}/delete`, {
      method: "POST",
    });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "삭제에 실패했습니다.");
      return;
    }
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <p className="text-[16px] font-semibold mb-3">내 공구 목록</p>

      {showForm ? (
        <div className="mb-5">
          <CampaignForm
            onCreated={(id) => goTo(id)}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-5 border border-dashed rounded-lg py-2.5 text-[13px] text-neutral-500"
        >
          + 새 공구 만들기
        </button>
      )}

      <AdminCalendar />

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
              <div
                key={c.id}
                className="bg-neutral-50 border rounded-lg p-3 flex items-center justify-between"
              >
                <button onClick={() => goTo(c.id)} className="text-left flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{c.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    주문 {c.order_count}건
                    {c.close_deadline && ` · ${formatDeadline(c.close_deadline)} 마감`}
                  </p>
                </button>
                <span className="text-[12px] text-neutral-400 flex-shrink-0 ml-2">보기 →</span>
              </div>
            ))}
          </div>

          {closed.length > 0 && (
            <>
              <p className="text-[12px] text-neutral-500 mb-2">
                마감됨 <span className="text-neutral-400">{closed.length}</span>
              </p>
              <div className="flex flex-col gap-2 mb-5">
                {closed.map((c) => (
                  <div
                    key={c.id}
                    className="bg-neutral-50 border rounded-lg p-3 flex items-center justify-between opacity-80"
                  >
                    <button onClick={() => goTo(c.id)} className="text-left flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{c.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        주문 {c.order_count}건
                        {c.closed_at && ` · ${formatDeadline(c.closed_at)} 마감됨`}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="text-[11px] text-red-500 border border-red-200 rounded px-2 py-1"
                      >
                        삭제
                      </button>
                      <span className="text-[12px] text-neutral-400">보기 →</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
          <div className="bg-white rounded-2xl border p-5 w-full max-w-sm">
            <p className="text-[15px] font-medium mb-2">공구를 삭제할까요?</p>
            <p className="text-[13px] text-neutral-500 mb-4">
              "{deleteTarget.title}" 공구와 관련된 모든 주문 데이터가 함께 삭제되며, 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border rounded-lg py-2 text-sm"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
