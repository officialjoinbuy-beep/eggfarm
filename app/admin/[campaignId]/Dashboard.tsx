"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPhone, formatWon } from "@/lib/format";
import { watermarkImage } from "@/lib/watermark";
import EditCampaignModal from "@/components/EditCampaignModal";
import StaffLinkManager from "@/components/StaffLinkManager";
import QrScanModal from "@/components/QrScanModal";
import SignaturePad from "@/components/SignaturePad";
import Spinner from "@/components/Spinner";

type Order = {
  id: string;
  nickname: string;
  phone: string;
  address: string;
  complex_name: string | null;
  total_amount: number;
  payment_status: "입금확인대기" | "입금확인완료" | "주문취소(미입금)";
  delivery_status: "배송준비" | "배송중" | "배송완료";
  payment_deadline: string | null;
  fulfillment_type: "배송" | "픽업";
  payment_method: "계좌이체" | "현장결제";
  pickup_status: "수령대기" | "수령완료" | "노쇼" | null;
  delivery_fee_charged: number;
  delivery_fee_waived: boolean;
  on_site_paid: boolean;
  cancelled_at: string | null;
  refund_status: "환불대기" | "환불완료" | null;
  order_items: { product_name_snapshot: string; quantity: number }[];
};

type Product = { id: string; name: string; stock_limit: number; stock_reserved: number };
type Campaign = {
  id: string;
  title: string;
  is_closed: boolean;
  fulfillment_mode: "pickup_only" | "delivery_only" | "hybrid";
  delivery_fee: number;
  close_deadline: string | null;
};

// 마감일시까지 남은 시간을 1초 단위로 갱신해 보여주는 카운트다운 배너.
function DeadlineCountdown({ closeDeadline, isClosed }: { closeDeadline: string | null; isClosed: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isClosed || !closeDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isClosed, closeDeadline]);

  if (isClosed || !closeDeadline) return null;

  const deadlineMs = new Date(closeDeadline).getTime();
  const remainingMs = deadlineMs - now;
  const deadlineText = new Date(closeDeadline).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (remainingMs <= 0) {
    return (
      <div className="bg-red-50 rounded-lg px-3.5 py-2.5 mb-3 text-[13px] text-red-600">
        ⏰ 마감시간이 지났습니다 ({deadlineText}) — 곧 자동 마감됩니다
      </div>
    );
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  const urgent = remainingMs < 60 * 60 * 1000; // 1시간 미만이면 경고색
  const remainingText =
    days > 0
      ? `${days}일 ${hours}시간 남음`
      : hours > 0
      ? `${hours}시간 ${minutes}분 남음`
      : `${minutes}분 ${seconds}초 남음`;

  return (
    <div
      className={`rounded-lg px-3.5 py-2.5 mb-3 text-[13px] ${
        urgent ? "bg-red-50 text-red-600" : "bg-neutral-50 text-neutral-600"
      }`}
    >
      ⏰ 마감 {deadlineText} · {remainingText}
    </div>
  );
}

const MODE_BADGE: Record<Campaign["fulfillment_mode"], string> = {
  pickup_only: "🏢 픽업전용",
  delivery_only: "🚚 배송전용",
  hybrid: "🏢🚚 픽업or배송",
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
  { key: "refundCancel", label: "취소/환불" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Dashboard({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [delegatedComplexNames, setDelegatedComplexNames] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>("wait");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [revertTarget, setRevertTarget] = useState<Order | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Order | null>(null);
  const [photoReplaceTarget, setPhotoReplaceTarget] = useState<Order | null>(null);
  const [pickupConfirmTarget, setPickupConfirmTarget] = useState<{
    order: Order;
    action: "pickup_complete" | "pickup_noshow";
  } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [ordersRes, staffRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaignId}/orders`),
      fetch(`/api/admin/campaigns/${campaignId}/staff-links`),
    ]);
    if (ordersRes.ok) {
      const data = await ordersRes.json();
      setCampaign(data.campaign);
      setProducts(data.products ?? []);
      setOrders(data.orders ?? []);
    }
    if (staffRes.ok) {
      const data = await staffRes.json();
      // 위임 판단: 무효화 안됐고 아직 만료 안 된 링크가 담당하는 단지들
      const complexesRes = await fetch(`/api/admin/campaigns/${campaignId}`);
      let complexIdToName: Record<string, string> = {};
      if (complexesRes.ok) {
        const cd = await complexesRes.json();
        complexIdToName = Object.fromEntries(
          (cd.complexes ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
        );
      }
      const now = Date.now();
      const names = new Set<string>();
      for (const link of data.links ?? []) {
        if (link.revoked) continue;
        if (new Date(link.expires_at).getTime() < now) continue;
        for (const cid of link.complex_ids as string[]) {
          if (complexIdToName[cid]) names.add(complexIdToName[cid]);
        }
      }
      setDelegatedComplexNames(names);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // 15초마다 자동 새로고침. 단, 각종 팝업이 열려있는 동안에는
  // 데이터가 바뀌어 화면이 어색해지지 않도록 멈춘다.
  const anyModalOpen =
    !!revertTarget ||
    closeConfirmOpen ||
    reopenConfirmOpen ||
    deleteConfirmOpen ||
    editOpen ||
    staffOpen ||
    qrScanOpen ||
    !!photoTarget ||
    !!photoReplaceTarget ||
    !!pickupConfirmTarget;

  useEffect(() => {
    if (anyModalOpen) return;
    const t = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, anyModalOpen]);

  // 검색은 정확일치(닉네임/연락처)만 인정한다.
  function matchesSearch(o: Order) {
    const q = search.trim();
    if (!q) return true;
    const qDigits = q.replace(/[^0-9]/g, "");
    return o.nickname === q || (qDigits.length > 0 && o.phone === qDigits);
  }

  const byTab: Record<TabKey, Order[]> = {
    wait: orders
      .filter((o) => o.payment_status === "입금확인대기" && !o.cancelled_at)
      .filter(matchesSearch),
    ready: orders
      .filter(
        (o) =>
          o.fulfillment_type === "배송" &&
          o.payment_status === "입금확인완료" &&
          o.delivery_status === "배송준비" &&
          !o.cancelled_at
      )
      .filter(matchesSearch),
    shipping: orders
      .filter(
        (o) =>
          o.fulfillment_type === "배송" &&
          o.payment_status === "입금확인완료" &&
          o.delivery_status === "배송중" &&
          !o.cancelled_at
      )
      .filter(matchesSearch),
    done: orders
      .filter((o) => o.fulfillment_type === "배송" && o.delivery_status === "배송완료" && !o.cancelled_at)
      .filter(matchesSearch),
    pickupWait: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "수령대기" && !o.cancelled_at)
      .filter(matchesSearch),
    pickupDone: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "수령완료")
      .filter(matchesSearch),
    noshow: orders
      .filter((o) => o.fulfillment_type === "픽업" && o.pickup_status === "노쇼")
      .filter(matchesSearch),
    cancel: orders.filter((o) => o.payment_status === "주문취소(미입금)").filter(matchesSearch),
    refundCancel: orders.filter((o) => !!o.cancelled_at).filter(matchesSearch),
  };

  // 검색어를 입력하면, 결과가 있는 첫 번째 탭으로 자동 이동해서 "없어 보이는" 혼동을 막는다.
  useEffect(() => {
    if (!search.trim()) return;
    if (byTab[tab].length > 0) return;
    const firstMatch = TABS.find((t) => byTab[t.key].length > 0);
    if (firstMatch) setTab(firstMatch.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function isDelegated(o: Order) {
    return o.fulfillment_type === "배송" && !!o.complex_name && delegatedComplexNames.has(o.complex_name);
  }

  async function confirmPayment(orderId: string) {
    setActionLoading(true);
    await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_payment" }),
    });
    setActionLoading(false);
    load();
  }

  async function cancelUnpaidOrder(orderId: string) {
    if (!confirm("이 주문을 즉시 취소할까요? (재고가 반환됩니다)")) return;
    setActionLoading(true);
    await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_unpaid_order" }),
    });
    setActionLoading(false);
    load();
  }

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function doCancelOrder() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    const res = await fetch(`/api/admin/orders/${cancelTarget.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_order" }),
    });
    setCancelling(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCancelError(data.error || "취소 처리 중 오류가 발생했습니다.");
      return;
    }
    setCancelTarget(null);
    load();
  }

  async function markRefundDone(orderId: string) {
    await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_refund_done" }),
    });
    load();
  }

  async function revertPickup(orderId: string) {
    await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revert_pickup" }),
    });
    load();
  }

  // 같은 공구 안에서 같은 연락처로 문앞배송/현장픽업을 여러 건 주문한 경우,
  // 배송/수령 리스트에서 눈에 띄게 표시해주기 위한 헬퍼
  function duplicatePhoneCount(o: Order, list: Order[]) {
    return list.filter((x) => x.phone === o.phone).length;
  }

  async function bulkConfirmPayment() {
    setActionLoading(true);
    await fetch("/api/admin/orders/bulk-confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    setActionLoading(false);
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
    setActionLoading(true);
    await fetch("/api/admin/orders/bulk-ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    setActionLoading(false);
    setSelected(new Set());
    load();
  }

  async function closeCampaign() {
    setActionLoading(true);
    await fetch(`/api/admin/campaigns/${campaignId}/close`, { method: "POST" });
    setActionLoading(false);
    setCloseConfirmOpen(false);
    load();
  }

  async function reopenCampaign() {
    setReopenError(null);
    setReopening(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/close`, { method: "DELETE" });
    setReopening(false);
    if (!res.ok) {
      const data = await res.json();
      setReopenError(data.error || "마감취소 처리 중 오류가 발생했습니다.");
      return;
    }
    setReopenConfirmOpen(false);
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

  async function doPickupAction(signature?: string | null, extraOrderIds?: string[]) {
    if (!pickupConfirmTarget) return;
    const { order, action } = pickupConfirmTarget;
    setActionLoading(true);
    const res = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, signature, extraOrderIds }),
    });
    setActionLoading(false);
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
  const currentRevenue = orders
    .filter((o) => o.payment_status === "입금확인완료" && !o.cancelled_at)
    .reduce((s, o) => s + o.total_amount, 0);

  return (
    <div>
      <p className="text-[15px] font-medium mb-3">
        {MODE_BADGE[campaign.fulfillment_mode]} {campaign.title}
      </p>
      <LinkCopyBox label="구매자 주문접수 링크" url={orderUrl} />

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
          onClick={() => campaign.is_closed && setStaffOpen(true)}
          disabled={!campaign.is_closed}
          className="flex-1 border rounded-lg py-2 text-[13px] text-neutral-600 disabled:opacity-40"
        >
          위임배송 등록
        </button>
      </div>
      {!campaign.is_closed && (
        <p className="text-[11px] text-neutral-400 mb-3 -mt-1.5">
          위임배송 등록은 공구 마감 후에 가능합니다
        </p>
      )}

      <DeadlineCountdown closeDeadline={campaign.close_deadline} isClosed={campaign.is_closed} />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">총 주문</p>
          <p className="text-[24px] font-medium">{orders.length}건</p>
        </div>
        <div className="bg-neutral-50 border rounded-xl p-4">
          <p className="text-[13px] text-neutral-500 mb-1">현재 매출</p>
          <p className="text-[24px] font-medium">{formatWon(currentRevenue)}</p>
        </div>
      </div>

      <div className="bg-neutral-50 border rounded-xl p-4 mb-4">
        <p className="text-[13px] text-neutral-500 mb-2">상품별 재고</p>
        <div className="flex flex-col gap-1.5">
          {products.map((p) => {
            const soldOut = p.stock_reserved >= p.stock_limit;
            return (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-[13px]">{p.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[14px] font-medium">
                    {p.stock_reserved}/{p.stock_limit}
                  </span>
                  {soldOut && (
                    <span className="text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                      품절
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-[13px]"
          placeholder="닉네임 또는 연락처 정확히 입력"
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
            disabled={selected.size === 0 || actionLoading}
            onClick={bulkConfirmPayment}
            className="text-[12px] px-2.5 py-1.5 border rounded disabled:opacity-40 flex items-center"
          >
            {actionLoading && <Spinner className="w-3 h-3" />}
            선택건 입금확인{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      {tab === "ready" && byTab.ready.some((o) => !isDelegated(o)) && (
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-neutral-500 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={
                selected.size > 0 &&
                selected.size === byTab.ready.filter((o) => !isDelegated(o)).length
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? new Set(byTab.ready.filter((o) => !isDelegated(o)).map((o) => o.id))
                    : new Set()
                )
              }
            />
            전체선택
          </label>
          <button
            disabled={selected.size === 0 || actionLoading}
            onClick={bulkShip}
            className="text-[12px] px-2.5 py-1.5 border rounded disabled:opacity-40 flex items-center"
          >
            {actionLoading && <Spinner className="w-3 h-3" />}
            선택건 배송중 처리{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      <div className="bg-neutral-50 border rounded-xl overflow-hidden">
        {byTab[tab].length === 0 && (
          <p className="text-center text-neutral-400 text-[13px] py-8">주문이 없습니다.</p>
        )}
        {byTab[tab].map((o, idx) => {
          const delegated = isDelegated(o);
          return (
            <div
              key={o.id}
              className={`flex items-center gap-2.5 p-3 ${
                idx < byTab[tab].length - 1 ? "border-b" : ""
              }`}
            >
              {((tab === "wait") || (tab === "ready" && !delegated)) && (
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
                    {o.fulfillment_type === "픽업" &&
                      o.payment_method === "현장결제" &&
                      (o.on_site_paid ? " · 결제완료" : " · 결제필요")}
                  </span>
                </p>
                <p className="text-[12px] text-neutral-500 break-words">
                  {o.order_items.map((i) => `${i.product_name_snapshot} · ${i.quantity}개`).join(", ")}
                </p>
                {o.fulfillment_type === "배송" && o.delivery_fee_charged > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    배송비 {formatWon(o.delivery_fee_charged)}
                  </span>
                )}
                {o.fulfillment_type === "배송" && o.delivery_fee_waived && (
                  <span className="text-[11px] text-blue-500"> · 배송비 면제(중복주문)</span>
                )}
                {(tab === "ready" || tab === "shipping" || tab === "pickupWait") &&
                  duplicatePhoneCount(o, byTab[tab]) > 1 && (
                    <span className="text-[11px] text-amber-600 block">
                      같은 연락처 추가주문 있음 ({duplicatePhoneCount(o, byTab[tab])}건)
                    </span>
                  )}
                {tab === "wait" && (
                  <span className="text-[11px] text-amber-600">
                    {(() => {
                      const m = minutesLeft(o.payment_deadline);
                      return m === null ? "무기한 대기" : `${m}분 남음`;
                    })()}
                  </span>
                )}
                {(tab === "ready" || tab === "shipping") && delegated && (
                  <span className="text-[11px] text-amber-600">위임배송 처리 중</span>
                )}
                {tab === "refundCancel" && (
                  <span className="text-[11px] text-neutral-500">
                    {o.refund_status === "환불완료" ? "환불완료" : o.refund_status === "환불대기" ? "환불대기" : "환불대상 아님(미입금)"}
                  </span>
                )}
              </div>

              {tab === "wait" && (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => confirmPayment(o.id)}
                    disabled={actionLoading}
                    className="text-[12px] px-2.5 py-1.5 bg-neutral-900 text-white rounded disabled:opacity-50"
                  >
                    입금확인
                  </button>
                  <button
                    onClick={() => cancelUnpaidOrder(o.id)}
                    disabled={actionLoading}
                    className="text-[12px] px-2.5 py-1.5 border border-red-200 text-red-500 rounded disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              )}
              {(tab === "ready" || tab === "pickupWait") && !delegated && (
                <button
                  onClick={() => setCancelTarget(o)}
                  className="text-[11px] px-2 py-1 border border-red-200 text-red-500 rounded flex-shrink-0"
                >
                  주문취소
                </button>
              )}
              {(tab === "shipping" || tab === "pickupDone" || tab === "noshow") && !delegated && (
                <p className="text-[10px] text-neutral-300 flex-shrink-0">
                  취소는 1:1 문의로
                </p>
              )}
              {tab === "refundCancel" && o.refund_status === "환불대기" && (
                <button
                  onClick={() => markRefundDone(o.id)}
                  className="text-[11px] px-2 py-1.5 bg-neutral-900 text-white rounded flex-shrink-0"
                >
                  환불완료 처리
                </button>
              )}
              {tab !== "wait" &&
                tab !== "pickupWait" &&
                tab !== "pickupDone" &&
                tab !== "noshow" &&
                tab !== "refundCancel" &&
                !delegated && (
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
              {tab === "done" && !delegated && (
                <button
                  onClick={() => setPhotoReplaceTarget(o)}
                  className="text-[11px] px-2 py-1.5 border rounded flex-shrink-0"
                >
                  사진 재등록
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
              {tab === "pickupDone" && (
                <button
                  onClick={() => revertPickup(o.id)}
                  className="text-[11px] px-2 py-1 bg-neutral-100 text-neutral-500 rounded flex-shrink-0"
                >
                  ↩ 되돌리기
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cancelTarget && (
        <Overlay>
          <p className="text-[15px] font-medium mb-2">주문을 취소할까요?</p>
          <p className="text-[13px] text-neutral-500 mb-1">
            {cancelTarget.nickname}님 / {formatPhone(cancelTarget.phone)}
          </p>
          <p className="text-[13px] text-neutral-500 mb-4">
            재고가 반환되어 다른 구매자가 바로 구매할 수 있게 됩니다.
            {cancelTarget.payment_method === "계좌이체" &&
              " 계좌이체로 이미 받은 금액은 오픈채팅 등으로 직접 환불해주신 뒤, '취소/환불' 탭에서 환불완료로 표시해주세요."}
          </p>
          {cancelError && <p className="text-[13px] text-red-600 mb-3">{cancelError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setCancelTarget(null)} className="flex-1 border rounded-lg py-2 text-sm">
              닫기
            </button>
            <button
              onClick={doCancelOrder}
              disabled={cancelling}
              className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center"
            >
              {cancelling && <Spinner />}
              {cancelling ? "처리 중..." : "주문취소"}
            </button>
          </div>
        </Overlay>
      )}

      <button
        onClick={() => setCloseConfirmOpen(true)}
        disabled={campaign.is_closed}
        className="w-full mt-3.5 border rounded-lg py-2.5 text-sm disabled:opacity-40"
      >
        {campaign.is_closed ? "마감됨" : "조기마감"}
      </button>
      {campaign.is_closed && (
        <>
          <button
            onClick={() => setReopenConfirmOpen(true)}
            disabled={delegatedComplexNames.size > 0}
            className="w-full mt-2 border rounded-lg py-2.5 text-sm text-neutral-600 disabled:opacity-40"
          >
            마감취소
          </button>
          {delegatedComplexNames.size > 0 && (
            <p className="text-[11px] text-neutral-400 mt-1.5 text-center">
              위임배송 링크가 살아있어 마감취소할 수 없습니다. 먼저 무효화해주세요.
            </p>
          )}
        </>
      )}
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
          loading={actionLoading}
        />
      )}

      {reopenConfirmOpen && (
        <Overlay>
          <p className="text-[15px] font-medium mb-2">마감을 취소할까요?</p>
          <p className="text-[13px] text-neutral-500 mb-4">
            주문접수 링크가 다시 열려 추가 주문을 받을 수 있게 됩니다. 지금까지 쌓인 주문/배송/입금
            데이터는 전혀 바뀌지 않습니다.
          </p>
          {reopenError && <p className="text-[13px] text-red-600 mb-3">{reopenError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setReopenConfirmOpen(false)}
              className="flex-1 border rounded-lg py-2 text-sm"
            >
              취소
            </button>
            <button
              onClick={reopenCampaign}
              disabled={reopening}
              className="flex-1 bg-neutral-900 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center"
            >
              {reopening && <Spinner />}
              {reopening ? "처리 중..." : "마감취소"}
            </button>
          </div>
        </Overlay>
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
              className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center"
            >
              {deleting && <Spinner />}
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
        <StaffLinkManager campaignId={campaignId} onClose={() => setStaffOpen(false)} onChanged={load} />
      )}

      {qrScanOpen && (
        <QrScanModal onCancel={() => setQrScanOpen(false)} onScanned={onQrScanned} />
      )}

      {photoTarget && (
        <PhotoUploadModal
          order={photoTarget}
          linkedOrders={byTab.shipping.filter(
            (o) => o.id !== photoTarget.id && o.phone === photoTarget.phone
          )}
          endpoint={`/api/admin/orders/${photoTarget.id}/photo`}
          title="배송완료 처리"
          confirmLabel="완료 처리"
          onCancel={() => setPhotoTarget(null)}
          onDone={() => {
            setPhotoTarget(null);
            load();
          }}
        />
      )}

      {photoReplaceTarget && (
        <PhotoUploadModal
          order={photoReplaceTarget}
          endpoint={`/api/admin/orders/${photoReplaceTarget.id}/photo-replace`}
          title="배송사진 재등록"
          confirmLabel="재등록"
          skipConfirmDialog
          onCancel={() => setPhotoReplaceTarget(null)}
          onDone={() => {
            setPhotoReplaceTarget(null);
            load();
          }}
        />
      )}

      {pickupConfirmTarget && (
        <PickupConfirmModal
          target={pickupConfirmTarget}
          linkedOrders={
            pickupConfirmTarget.action === "pickup_complete"
              ? byTab.pickupWait.filter(
                  (o) => o.id !== pickupConfirmTarget.order.id && o.phone === pickupConfirmTarget.order.phone
                )
              : []
          }
          onCancel={() => setPickupConfirmTarget(null)}
          onConfirm={doPickupAction}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

function PickupConfirmModal({
  target,
  linkedOrders,
  onCancel,
  onConfirm,
  loading,
}: {
  target: { order: Order; action: "pickup_complete" | "pickup_noshow" };
  linkedOrders?: Order[];
  onCancel: () => void;
  onConfirm: (signature?: string | null, extraOrderIds?: string[]) => void;
  loading?: boolean;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(
    new Set((linkedOrders ?? []).map((o) => o.id))
  );
  const needsSignature = target.action === "pickup_complete";

  function toggleExtra(id: string) {
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Overlay>
      <p className="text-[15px] font-medium mb-2">
        {target.action === "pickup_complete" ? "수령완료 처리할까요?" : "노쇼로 처리할까요?"}
      </p>
      <p className="text-[13px] text-neutral-500 mb-1">
        {target.order.nickname}님 / {formatPhone(target.order.phone)}
      </p>
      <p className="text-[13px] text-neutral-500 mb-4">
        {target.order.order_items.map((i) => `${i.product_name_snapshot} ${i.quantity}개`).join(", ")}
      </p>
      {linkedOrders && linkedOrders.length > 0 && (
        <div className="border rounded-lg p-2.5 mb-3.5 bg-amber-50">
          <p className="text-[12px] text-amber-700 mb-1.5">
            같은 연락처로 대기 중인 주문이 더 있어요. 서명 1번으로 같이 수령처리할까요?
          </p>
          {linkedOrders.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-[12px] text-neutral-700 py-0.5">
              <input
                type="checkbox"
                checked={selectedExtras.has(o.id)}
                onChange={() => toggleExtra(o.id)}
              />
              {o.order_items.map((i) => `${i.product_name_snapshot} ${i.quantity}개`).join(", ")}
            </label>
          ))}
        </div>
      )}
      {target.action === "pickup_noshow" && (
        <p className="text-[12px] text-red-500 mb-3">
          같은 연락처로 2회 노쇼 시 이후 현장픽업 주문이 제한됩니다.
        </p>
      )}
      {needsSignature && (
        <div className="mb-3">
          <p className="text-[12px] text-neutral-500 mb-1.5">구매자 서명</p>
          <SignaturePad onChange={setSignature} />
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm">
          취소
        </button>
        <button
          onClick={() => onConfirm(signature, Array.from(selectedExtras))}
          disabled={(needsSignature && !signature) || loading}
          className={`flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-40 flex items-center justify-center ${
            target.action === "pickup_noshow" ? "bg-red-600" : "bg-neutral-900"
          }`}
        >
          {loading && <Spinner />}
          확인
        </button>
      </div>
    </Overlay>
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
  loading,
}: {
  orders: Order[];
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const waitCount = orders.filter((o) => o.payment_status === "입금확인대기").length;
  const validOrders = orders.filter(
    (o) => o.payment_status !== "주문취소(미입금)" && !o.cancelled_at
  );
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
          disabled={loading}
          className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center"
        >
          {loading && <Spinner />}
          마감하기
        </button>
      </div>
    </Overlay>
  );
}

function PhotoUploadModal({
  order,
  linkedOrders,
  endpoint,
  title,
  confirmLabel,
  skipConfirmDialog,
  onCancel,
  onDone,
}: {
  order: Order;
  linkedOrders?: Order[];
  endpoint: string;
  title: string;
  confirmLabel: string;
  skipConfirmDialog?: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(
    new Set((linkedOrders ?? []).map((o) => o.id))
  );

  function onSelect(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function toggleExtra(id: string) {
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!file) return;
    if (!skipConfirmDialog) {
      const proceed = window.confirm(
        `${order.nickname}님(${formatPhone(order.phone)}) / ${order.address}\n${title.replace("처리", "처리할까요")}?`
      );
      if (!proceed) return;
    }

    setUploading(true);
    const watermarked = await watermarkImage(file);
    const formData = new FormData();
    formData.append("photo", watermarked, "delivery.jpg");
    if (selectedExtras.size > 0) {
      formData.append("extraOrderIds", JSON.stringify(Array.from(selectedExtras)));
    }
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
    <Overlay>
      <p className="text-[15px] font-medium mb-1">{title}</p>
      <p className="text-[13px] text-neutral-500 mb-4">
        {order.nickname} · {order.order_items.map((i) => `${i.product_name_snapshot} ${i.quantity}개`).join(", ")}
      </p>

      {linkedOrders && linkedOrders.length > 0 && (
        <div className="border rounded-lg p-2.5 mb-3.5 bg-amber-50">
          <p className="text-[12px] text-amber-700 mb-1.5">
            같은 연락처로 대기 중인 주문이 더 있어요. 같이 사진 1장으로 완료 처리할까요?
          </p>
          {linkedOrders.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-[12px] text-neutral-700 py-0.5">
              <input
                type="checkbox"
                checked={selectedExtras.has(o.id)}
                onChange={() => toggleExtra(o.id)}
              />
              {o.order_items.map((i) => `${i.product_name_snapshot} ${i.quantity}개`).join(", ")}
            </label>
          ))}
        </div>
      )}

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
          className="flex-1 bg-neutral-900 text-white rounded-lg py-2 text-sm disabled:opacity-50 flex items-center justify-center"
        >
          {uploading && <Spinner />}
          {uploading ? "업로드 중..." : confirmLabel}
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
