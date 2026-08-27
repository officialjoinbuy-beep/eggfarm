"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPhone, formatWon } from "@/lib/format";
import { watermarkImage } from "@/lib/watermark";
import EditCampaignModal from "@/components/EditCampaignModal";
import StaffLinkManager from "@/components/StaffLinkManager";
import QrScanModal from "@/components/QrScanModal";

type Order = {
  id: string;
  nickname: string;
  phone: string;
  address: string;
  total_amount: number;
  payment_status: "입금확인대기" | "입금확인완료" | "주문취소(미입금)";
  delivery_status: "배송준비" | "배송중" | "배송완료";
  payment_deadline: string | null;
  fulfillment_type: "배송" | "픽업";
  payment_method: "계좌이체" | "현장결제";
  pickup_status: "수령대기" | "수령완료" | "노쇼" | null;
  order_items: { product_name_snapshot: string; quantity: number }[];
};

type Product = { id: string; name: string; stock_limit: number; stock_reserved: number };
type Campaign = {
  id: string;
  title: string;
  is_closed: boolean;
  delivery_mode: "직접배송" | "위임배송";
  delivery_fee_per_order: number;
};

const TABS = [
  { key: "wait", label: "입금확인대기" },
  { key: "ready", label: "배송준비" },
  { key: "shipping", label: "배송중" },
  { key: "done", label: "배송완료" },
  { key: "pickupWait", label: "수령대기" },
  { key: "pickupDone", label: "수령완료" },
  { key: "noshow", label: "노쇼" },
  { key: "cancel", label: "주문취소" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Dashboard({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<TabKey>("wait");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [revertTarget, setRevertTarget] = useState<Order | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Order | null>(null);
  const [pickupConfirmTarget, setPickupConfirmTarget] = useState<{
    order: Order;
    action: "pickup_complete" | "pickup_noshow";
  } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch(`/api/admin/campaigns/${campaignId}/orders`);
    if (res.ok) {
      const data = await res.json();
      setCampaign(data.campaign);
      setProducts(data.products ?? []);
      setOrders(data.orders ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  // 15초마다 자동 새로고침. 단, 각종 팝업이 열려있는 동안에는
  // 데이터가 바뀌어 화면이 어색해지지 않도록 멈춘다.
  const anyModalOpen =
    !!revertTarget ||
    closeConfirmOpen ||
    deleteConfirmOpen ||
    editOpen ||
    staffOpen ||
    qrScanOpen ||
    !!photoTarget ||
    !!pickupConfirmTarget;

  useEffect(() => {
    if (anyModalOpen) return;
    const t = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(t);
  }, [campaignId, anyModalOpen]);

  function matchesSearch(o: Order) {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return o.nickname.toLowerCase().includes(q) || o.phone.includes(q);
  }

  const byTab: Record<TabKey, Order[]> = {
    wait: orders.filter((o) => o.payment_status === "입금확인대기").filter(matchesSearch),
    ready: orders
      .filter(
        (o) =>
          o.fulfillment_type === "배송" &&
          o.payment_status === "입금확인완료" &&
          o.delivery_status === "배송준비"
      )
      .filter(matchesSearch),
    shipping: orders
      .filter(
        (o) =>
          o.fulfillment_type === "배송" &&
          o.payment_status === "입금확인완료" &&
          o.delivery_status === "배송중"
      )
      .filter(matchesSearch),
    done: orders
      .filter((o) => o.fulfillment_type === "배송" && o.delivery_status === "배송완료")
      .filter(matchesSearch),
    pickupWait: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "수령대기")
      .filter(matchesSearch),
    pickupDone: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "수령완료")
      .filter(matchesSearch),
    noshow: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "노쇼")
      .filter(matchesSearch),
    cancel: orders.filter((o) => o.payment_status === "주문취소(미입금)").filter(matchesSearch),
  };

  async function confirmPayment(orderId: string) {
    await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_payment" }),
    });
    load();
  }

  async function bulkConfirmPayment() {
    await fetch("/api/admin/orders/bulk-confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    setSelected(new Set());
    load();
  }

  async function doRevert() {
    if (!revertTarget) return;
    const o = revertTarget;
    let action = "";
    if (o.payment_status === "주문취소(미입금)") action = "revert_cancel";
    else if (o.fulfillment_type === "배송" && o.delivery_status === "배송준비") action = "revert_payment";
    else if (o.fulfillment_type === "배송" && o.delivery_status === "배송중") action = "revert_shipping";
    else if (o.fulfillment_type === "배송" && o.delivery_status === "배송완료") action = "revert_delivered";

    if (!action) {
      setRevertTarget(null);
      return;
    }

    const res = await fetch(`/api/admin/orders/${o.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "되돌리기에 실패했습니다.");
    }
    setRevertTarget(null);
    load();
  }

  function revertLabel(o: Order) {
    if (o.payment_status === "주문취소(미입금)") return "주문취소(미입금) → 입금확인대기";
    if (o.delivery_status === "배송준비") return "배송준비 → 입금확인대기";
    if (o.delivery_status === "배송중") return "배송중 → 배송준비";
    if (o.delivery_status === "배송완료") return "배송완료 → 배송중";
    return "";
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkShip() {
    await fetch("/api/admin/orders/bulk-ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    setSelected(new Set());
    load();
  }

  async function closeCampaign() {
    await fetch(`/api/admin/campaigns/${campaignId}/close`, { method: "POST" });
    setCloseConfirmOpen(false);
    load();
  }

  async function deleteCampaign() {
    setDeleting(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/delete`, {
      method: "POST",
    });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "삭제에 실패했습니다.");
      return;
    }
    router.push("/admin");
  }

  async function doPickupAction() {
    if (!pickupConfirmTarget) return;
    const { order, action } = pickupConfirmTarget;
    const res = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "처리에 실패했습니다.");
    }
    setPickupConfirmTarget(null);
    load();
  }

  async function onQrScanned(token: string) {
    setQrScanOpen(false);
    const res = await fetch("/api/admin/orders/scan-pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "조회에 실패했습니다.");
      return;
    }
    setPickupConfirmTarget({ order: data.order, action: "pickup_complete" });
  }

  function minutesLeft(deadline: string | null) {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / 60000);
  }

  if (loading) return <p className="text-center text-neutral-400 py-20 text-sm">불러오는 중...</p>;
  if (!campaign) return <p className="text-center text-neutral-400 py-20 text-sm">공구를 찾을 수 없습니다.</p>;

  const orderUrl = typeof window !== "undefined" ? `${window.location.origin}/order/${campaignId}` : "";
  const lookupUrl = typeof window !== "undefined" ? `${window.location.origin}/lookup/${campaignId}` : "";
  const delegated = campaign.delivery_mode === "위임배송";

  return (
    <div>
      <LinkCopyBox label="구매자 주문접수 링크" url={orderUrl} />
      <LinkCopyBox label="구매자 주문조회 링크" url={lookupUrl} />

      <div className="flex gap-2 mb-3">
        {!campaign.is_closed && (
          <button
            onClick={() => setEditOpen(true)}
            className="flex-1 border rounded-lg py-2 text-[13px] text-neutral-600"
          >
            공구 정보 수정
          </button>
        )}
        <button
          onClick={() => setStaffOpen(true)}
          className="flex-1 border rounded-lg py-2 text-[13px] text-neutral-600"
        >
          배송담당자 관리
        </button>
      </div>

      {delegated && (
        <div className="bg-amber-50 rounded-lg p-2.5 mb-3">
          <p className="text-[12px] text-amber-700">
            위임배송 모드입니다 — 배송준비→배송중, 배송중→배송완료는 배송담당자 화면에서만 처리됩니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">총 주문</p>
          <p className="text-[24px] font-medium">{orders.length}건</p>
        </div>
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">상품 종류</p>
          <p className="text-[24px] font-medium">{products.length}개</p>
        </div>
      </div>

      <div className="bg-neutral-50 border rounded-xl p-4 mb-4">
        <p className="text-[13px] text-neutral-500 mb-2">상품별 재고</p>
        <div className="flex flex-col gap-1.5">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-[13px]">{p.name}</span>
              <span className="text-[14px] font-medium">
                {p.stock_reserved}/{p.stock_limit}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-[13px]"
          placeholder="닉네임 또는 연락처로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setQrScanOpen(true)}
          className="flex-shrink-0 border rounded-lg px-3 py-2 text-[13px]"
        >
          QR 스캔
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 text-[12px] px-2.5 py-1.5 rounded whitespace-nowrap ${
              tab === t.key ? "bg-neutral-900 text-white" : "bg-neutral-100"
            }`}
          >
            {t.label} <span className="opacity-60">{byTab[t.key].length}</span>
          </button>
        ))}
      </div>

      {tab === "wait" && byTab.wait.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-neutral-500 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected.size === byTab.wait.length}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(byTab.wait.map((o) => o.id)) : new Set())
              }
            />
            전체선택
          </label>
          <button
            disabled={selected.size === 0}
            onClick={bulkConfirmPayment}
            className="text-[12px] px-2.5 py-1.5 border rounded disabled:opacity-40"
          >
            선택건 입금확인{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      {tab === "ready" && !delegated && byTab.ready.length > 0 && (
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
          <p className="text-center text-neutral-400 text-[13px] py-8">주문이 없습니다.</p>
        )}
        {byTab[tab].map((o, idx) => (
          <div
            key={o.id}
            className={`flex items-center gap-2.5 p-3 ${
              idx < byTab[tab].length - 1 ? "border-b" : ""
            }`}
          >
            {(tab === "wait" || (tab === "ready" && !delegated)) && (
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggleSelect(o.id)}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium truncate">
                {o.nickname}{" "}
                <span className="text-[11px] text-neutral-400 font-normal">
                  {o.fulfillment_type === "픽업" ? "· 현장픽업" : "· 문앞배송"}
                  {o.fulfillment_type === "픽업" && o.payment_method === "현장결제" && " · 현장결제"}
                </span>
              </p>
              <p className="text-[12px] text-neutral-500 break-words">
                {o.order_items.map((i) => `${i.product_name_snapshot} · ${i.quantity}개`).join(", ")}
              </p>
              {tab === "wait" && (
                <span className="text-[11px] text-amber-600">
                  {(() => {
                    const m = minutesLeft(o.payment_deadline);
                    return m === null ? "무기한 대기" : `${m}분 남음`;
                  })()}
                </span>
              )}
            </div>

            {tab === "wait" && (
              <button
                onClick={() => confirmPayment(o.id)}
                className="text-[12px] px-2.5 py-1.5 bg-neutral-900 text-white rounded flex-shrink-0"
              >
                입금확인
              </button>
            )}
            {tab !== "wait" && tab !== "pickupWait" && tab !== "pickupDone" && tab !== "noshow" && (
              <button
                onClick={() => setRevertTarget(o)}
                className="text-[11px] px-2 py-1 bg-neutral-100 text-neutral-500 rounded flex-shrink-0"
              >
                ↩ 되돌리기
              </button>
            )}
            {tab === "shipping" && !delegated && (
              <button
                onClick={() => setPhotoTarget(o)}
                className="text-[12px] px-2.5 py-1.5 border rounded flex-shrink-0"
              >
                배송완료 처리
              </button>
            )}
            {tab === "pickupWait" && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setPickupConfirmTarget({ order: o, action: "pickup_noshow" })}
                  className="text-[11px] px-2 py-1.5 border border-red-200 text-red-500 rounded"
                >
                  노쇼
                </button>
                <button
                  onClick={() => setPickupConfirmTarget({ order: o, action: "pickup_complete" })}
                  className="text-[12px] px-2.5 py-1.5 bg-neutral-900 text-white rounded"
                >
                  수령완료
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setCloseConfirmOpen(true)}
        disabled={campaign.is_closed}
        className="w-full mt-3.5 border rounded-lg py-2.5 text-sm disabled:opacity-40"
      >
        {campaign.is_closed ? "마감됨" : "조기마감"}
      </button>
      <a
        href={`/api/admin/campaigns/${campaignId}/export`}
        className="block w-full mt-2 text-center border rounded-lg py-2.5 text-sm"
      >
        집계표 다운로드
      </a>
      {campaign.is_closed && (
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          className="w-full mt-2 border border-red-200 text-red-500 rounded-lg py-2.5 text-sm"
        >
          공구 삭제
        </button>
      )}

      {revertTarget && (
        <RevertModal
          order={revertTarget}
          label={revertLabel(revertTarget)}
          onCancel={() => setRevertTarget(null)}
          onConfirm={doRevert}
        />
      )}

      {closeConfirmOpen && (
        <CloseModal
          orders={orders}
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={closeCampaign}
        />
      )}

      {deleteConfirmOpen && (
        <Overlay>
          <p className="text-[15px] font-medium mb-2">공구를 삭제할까요?</p>
          <p className="text-[13px] text-neutral-500 mb-4">
            "{campaign.title}" 공구와 관련된 모든 주문 데이터가 함께 삭제되며, 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              className="flex-1 border rounded-lg py-2 text-sm"
            >
              취소
            </button>
            <button
              onClick={deleteCampaign}
              disabled={deleting}
              className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm disabled:opacity-50"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </Overlay>
      )}

      {editOpen && (
        <EditCampaignModal
          campaignId={campaignId}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}

      {staffOpen && (
        <StaffLinkManager campaignId={campaignId} onClose={() => setStaffOpen(false)} />
      )}

      {qrScanOpen && (
        <QrScanModal onCancel={() => setQrScanOpen(false)} onScanned={onQrScanned} />
      )}

      {photoTarget && (
        <PhotoUploadModal
          order={photoTarget}
          onCancel={() => setPhotoTarget(null)}
          onDone={() => {
            setPhotoTarget(null);
            load();
          }}
        />
      )}

      {pickupConfirmTarget && (
        <Overlay>
          <p className="text-[15px] font-medium mb-2">
            {pickupConfirmTarget.action === "pickup_complete" ? "수령완료 처리할까요?" : "노쇼로 처리할까요?"}
          </p>
          <p className="text-[13px] text-neutral-500 mb-1">
            {pickupConfirmTarget.order.nickname}님 / {formatPhone(pickupConfirmTarget.order.phone)}
          </p>
          <p className="text-[13px] text-neutral-500 mb-4">
            {pickupConfirmTarget.order.order_items
              .map((i) => `${i.product_name_snapshot} ${i.quantity}개`)
              .join(", ")}
          </p>
          {pickupConfirmTarget.action === "pickup_noshow" && (
            <p className="text-[12px] text-red-500 mb-3">
              같은 연락처로 2회 노쇼 시 이후 현장픽업 주문이 제한됩니다.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setPickupConfirmTarget(null)}
              className="flex-1 border rounded-lg py-2 text-sm"
            >
              취소
            </button>
            <button
              onClick={doPickupAction}
              className={`flex-1 rounded-lg py-2 text-sm text-white ${
                pickupConfirmTarget.action === "pickup_noshow" ? "bg-red-600" : "bg-neutral-900"
              }`}
            >
              확인
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function RevertModal({
  order,
  label,
  onCancel,
  onConfirm,
}: {
  order: Order;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[15px] font-medium">상태를 되돌릴까요?</p>
      </div>
      <p className="text-[13px] text-neutral-500 mb-1">{order.nickname}님 주문을</p>
      <p className="text-[13px] mb-4">
        <strong>{label}</strong>으로 되돌립니다.
      </p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm">
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm"
        >
          되돌리기
        </button>
      </div>
    </Overlay>
  );
}

function CloseModal({
  orders,
  onCancel,
  onConfirm,
}: {
  orders: Order[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const waitCount = orders.filter((o) => o.payment_status === "입금확인대기").length;
  const validOrders = orders.filter((o) => o.payment_status !== "주문취소(미입금)");
  const total = validOrders.reduce((s, o) => s + o.total_amount, 0);

  return (
    <Overlay>
      <p className="text-[15px] font-medium mb-2">공구를 마감할까요?</p>
      <p className="text-[13px] text-neutral-500 mb-3">
        마감 후에는 주문접수가 중단되며, 되돌릴 수 없습니다.
      </p>
      <div className="bg-neutral-100 rounded-lg p-3 mb-4 text-[13px]">
        <div className="flex justify-between mb-1">
          <span className="text-neutral-500">총 주문건</span>
          <span>{orders.length}건</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-neutral-500">입금확인대기</span>
          <span className="text-amber-600">{waitCount}건</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">총 결제금액</span>
          <span>{formatWon(total)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm">
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm"
        >
          마감하기
        </button>
      </div>
    </Overlay>
  );
}

function PhotoUploadModal({
  order,
  onCancel,
  onDone,
}: {
  order: Order;
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
    const proceed = window.confirm(
      `${order.nickname}님(${formatPhone(order.phone)}) / ${order.address}\n배송완료 처리할까요?`
    );
    if (!proceed) return;

    setUploading(true);
    const watermarked = await watermarkImage(file);
    const formData = new FormData();
    formData.append("photo", watermarked, "delivery.jpg");
    const res = await fetch(`/api/admin/orders/${order.id}/photo`, {
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
    <Overlay>
      <p className="text-[15px] font-medium mb-1">배송완료 처리</p>
      <p className="text-[13px] text-neutral-500 mb-4">
        {order.nickname} · {order.order_items.map((i) => `${i.product_name_snapshot} ${i.quantity}개`).join(", ")}
      </p>

      <label className="relative border border-dashed rounded-lg aspect-[4/3] flex flex-col items-center justify-center gap-1.5 mb-3.5 cursor-pointer overflow-hidden">
        <span className="absolute top-2 right-2 text-[13px] font-semibold bg-black/55 text-white px-2 py-1 rounded">
          {order.address}
        </span>
        {preview ? (
          <img src={preview} className="w-full h-full object-cover" alt="preview" />
        ) : (
          <>
            <span className="text-[13px] text-neutral-500">배송사진 촬영 또는 업로드</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="bg-neutral-100 rounded-lg p-2.5 flex items-center gap-2 mb-4">
        <p className="text-[12px] text-neutral-500">
          업로드 시 촬영시간이 자동으로 워터마크 됩니다
        </p>
      </div>

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
    </Overlay>
  );
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-5 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function LinkCopyBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-neutral-50 border rounded-lg p-2.5 mb-2">
      <p className="text-[11px] text-neutral-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 text-[12px] truncate">{url}</p>
        <button
          onClick={copy}
          className="flex-shrink-0 text-[11px] px-2 py-1 border rounded bg-white"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
