"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatPhone, formatWon } from "@/lib/format";
import { watermarkImage } from "@/lib/watermark";

type Order = {
  id: string;
  nickname: string;
  phone: string;
  address: string;
  dong: string | null;
  unit_no: string | null;
  delivery_status: "배송준비" | "배송중" | "배송완료";
  total_amount: number;
  order_items: { product_name_snapshot: string; quantity: number }[];
};

type TabKey = "ready" | "shipping" | "done";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ready", label: "배송준비" },
  { key: "shipping", label: "배송중" },
  { key: "done", label: "배송완료" },
];

export default function StaffPage() {
  const params = useParams();
  const token = params.token as string;

  const [campaignTitle, setCampaignTitle] = useState("");
  const [feePerOrder, setFeePerOrder] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<TabKey>("ready");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoTarget, setPhotoTarget] = useState<Order | null>(null);
  const [photoReplaceTarget, setPhotoReplaceTarget] = useState<Order | null>(null);

  async function revert(orderId: string) {
    if (!window.confirm("이전 단계로 되돌릴까요?")) return;
    await fetch(`/api/staff/${token}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    load();
  }

  async function load() {
    const res = await fetch(`/api/staff/${token}/orders`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "링크에 접근할 수 없습니다.");
      setLoading(false);
      return;
    }
    setCampaignTitle(data.campaign?.title ?? "");
    setFeePerOrder(data.feePerOrder ?? 0);
    setOrders(data.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!photoTarget) load();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, photoTarget]);

  const byTab: Record<TabKey, Order[]> = {
    ready: orders.filter((o) => o.delivery_status === "배송준비"),
    shipping: orders.filter((o) => o.delivery_status === "배송중"),
    done: orders.filter((o) => o.delivery_status === "배송완료"),
  };

  const doneCount = byTab.done.length;
  const totalCount = orders.length;
  const remainingCount = totalCount - doneCount;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkShip() {
    await fetch(`/api/staff/${token}/bulk-ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    setSelected(new Set());
    load();
  }

  if (loading) return <p className="text-center text-neutral-400 py-20 text-sm">불러오는 중...</p>;
  if (error) return <p className="text-center text-red-500 py-20 text-sm px-5">{error}</p>;

  return (
    <main className="max-w-md mx-auto p-5">
      <p className="text-[13px] text-neutral-500 mb-1">{campaignTitle}</p>
      <p className="text-[15px] font-medium mb-4">배송 담당자 화면</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">배달 진행</p>
          <p className="text-[20px] font-medium">
            {doneCount}/{totalCount}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">남은 건 {remainingCount}건</p>
        </div>
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">예상 정산액</p>
          <p className="text-[20px] font-medium">{formatWon(doneCount * feePerOrder)}</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">건당 {formatWon(feePerOrder)}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-[13px] px-2.5 py-2 rounded ${
              tab === t.key ? "bg-neutral-900 text-white" : "bg-neutral-100"
            }`}
          >
            {t.label} <span className="opacity-60">{byTab[t.key].length}</span>
          </button>
        ))}
      </div>

      {tab === "ready" && byTab.ready.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-neutral-500 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected.size === byTab.ready.length}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(byTab.ready.map((o) => o.id)) : new Set())
              }
            />
            전체선택
          </label>
          <button
            disabled={selected.size === 0}
            onClick={bulkShip}
            className="text-[12px] px-2.5 py-1.5 border rounded disabled:opacity-40"
          >
            선택건 배송중 처리{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      <div className="bg-neutral-50 border rounded-xl overflow-hidden">
        {byTab[tab].length === 0 && (
          <p className="text-center text-neutral-400 text-[13px] py-8">해당 주문이 없습니다.</p>
        )}
        {byTab[tab].map((o, idx) => (
          <div
            key={o.id}
            className={`flex items-center gap-2.5 p-3 ${idx < byTab[tab].length - 1 ? "border-b" : ""}`}
          >
            {tab === "ready" && (
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium truncate">{o.nickname}</p>
              <p className="text-[12px] text-neutral-500">{o.address}</p>
              <p className="text-[12px] text-neutral-500 break-words">
                {o.order_items.map((i) => `${i.product_name_snapshot} · ${i.quantity}개`).join(", ")}
              </p>
            </div>
            {tab === "shipping" && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => revert(o.id)}
                  className="text-[11px] px-2 py-1 bg-neutral-100 text-neutral-500 rounded"
                >
                  ↩되돌리기
                </button>
                <button
                  onClick={() => setPhotoTarget(o)}
                  className="text-[12px] px-2.5 py-1.5 border rounded"
                >
                  배송완료 처리
                </button>
              </div>
            )}
            {tab === "done" && (
              <button
                onClick={() => setPhotoReplaceTarget(o)}
                className="text-[11px] px-2 py-1.5 border rounded flex-shrink-0"
              >
                사진 재등록
              </button>
            )}
          </div>
        ))}
      </div>

      {photoTarget && (
        <StaffPhotoModal
          token={token}
          order={photoTarget}
          endpoint={`/api/staff/${token}/complete`}
          title="배송완료 처리"
          onCancel={() => setPhotoTarget(null)}
          onDone={() => {
            setPhotoTarget(null);
            load();
          }}
        />
      )}

      {photoReplaceTarget && (
        <StaffPhotoModal
          token={token}
          order={photoReplaceTarget}
          endpoint={`/api/staff/${token}/photo-replace`}
          title="배송사진 재등록"
          skipConfirm
          onCancel={() => setPhotoReplaceTarget(null)}
          onDone={() => {
            setPhotoReplaceTarget(null);
            load();
          }}
        />
      )}
    </main>
  );
}

function StaffPhotoModal({
  token,
  order,
  endpoint,
  title,
  skipConfirm,
  onCancel,
  onDone,
}: {
  token: string;
  order: Order;
  endpoint: string;
  title: string;
  skipConfirm?: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function onSelect(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!file) return;
    if (!skipConfirm) {
      const proceed = window.confirm(
        `${order.nickname}님(${formatPhone(order.phone)}) / ${order.address}\n${title}할까요?`
      );
      if (!proceed) return;
    }

    setUploading(true);
    const watermarked = await watermarkImage(file);
    const formData = new FormData();
    formData.append("orderId", order.id);
    formData.append("photo", watermarked, "delivery.jpg");
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    if (!res.ok) {
      alert("업로드에 실패했습니다.");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl">
        <p className="text-[15px] font-medium mb-1">{title}</p>
        <p className="text-[13px] text-neutral-500 mb-4">
          {order.nickname} · {order.address}
        </p>

        <label className="relative border border-dashed rounded-lg aspect-[4/3] flex flex-col items-center justify-center gap-1.5 mb-3.5 cursor-pointer overflow-hidden">
          {preview ? (
            <img src={preview} className="w-full h-full object-cover" alt="preview" />
          ) : (
            <span className="text-[13px] text-neutral-500">배송사진 촬영 또는 업로드</span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm">
            취소
          </button>
          <button
            onClick={submit}
            disabled={!file || uploading}
            className="flex-1 bg-neutral-900 text-white rounded-lg py-2 text-sm disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "완료 처리"}
          </button>
        </div>
      </div>
    </div>
  );
}
