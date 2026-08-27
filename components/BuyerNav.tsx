import Link from "next/link";

// 구매자 화면(주문접수 / 주문조회) 상단에 공통으로 붙는 전환 탭.
// 같은 공구 ID를 유지한 채 /order/[id] ↔ /lookup/[id] 를 오갈 수 있게 한다.
export default function BuyerNav({
  campaignId,
  active,
}: {
  campaignId: string;
  active: "order" | "lookup";
}) {
  return (
    <div className="flex gap-1.5 mb-3">
      <Link
        href={`/order/${campaignId}`}
        className={`flex-1 text-center text-[13px] font-medium py-2 rounded-lg border ${
          active === "order"
            ? "bg-neutral-900 text-white border-neutral-900"
            : "bg-white text-neutral-600 border-neutral-200"
        }`}
      >
        주문하기
      </Link>
      <Link
        href={`/lookup/${campaignId}`}
        className={`flex-1 text-center text-[13px] font-medium py-2 rounded-lg border ${
          active === "lookup"
            ? "bg-neutral-900 text-white border-neutral-900"
            : "bg-white text-neutral-600 border-neutral-200"
        }`}
      >
        주문조회
      </Link>
    </div>
  );
}
