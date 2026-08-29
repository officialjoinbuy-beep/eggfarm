import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { formatPhone, sortByDongUnitDesc } from "@/lib/format";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: allOrders } = await supabase
    .from("orders")
    .select(
      "nickname, phone, address, complex_name, dong, unit_no, entry_password, fulfillment_type, payment_method, total_amount, delivery_fee_charged, payment_status, delivery_status, pickup_status, cancelled_at, refund_status, created_at, order_items(product_name_snapshot, quantity, unit_price)"
    )
    .eq("campaign_id", id)
    .neq("payment_status", "주문취소(미입금)");

  if (!allOrders) {
    return NextResponse.json({ error: "데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  // 결제 후 취소된 주문은 발주/매출 집계에서 제외하고 별도 시트로 뺀다
  const orders = allOrders.filter((o) => !o.cancelled_at);
  const cancelledOrders = allOrders.filter((o) => !!o.cancelled_at);

  // 1) 발주용 요약: 상품별 총 수량
  const summaryMap = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.order_items as any[]) {
      summaryMap.set(
        item.product_name_snapshot,
        (summaryMap.get(item.product_name_snapshot) || 0) + item.quantity
      );
    }
  }
  const summarySheet = XLSX.utils.json_to_sheet(
    Array.from(summaryMap.entries()).map(([상품명, 총수량]) => ({ 상품명, 총수량 }))
  );

  // 2) 문앞배송 상세 - 배송동선 기준(동→호수 내림차순) 정렬
  const deliveryOrders = sortByDongUnitDesc(orders.filter((o) => o.fulfillment_type === "배송"));
  const deliveryRows = deliveryOrders.map((o) => ({
    닉네임: o.nickname,
    연락처: formatPhone(o.phone),
    단지명: o.complex_name || "",
    동: o.dong || "",
    호수: o.unit_no || "",
    출입비밀번호: o.entry_password || "",
    전체주소: o.address,
    주문상품: (o.order_items as any[])
      .map((i) => `${i.product_name_snapshot} x${i.quantity}`)
      .join(", "),
    결제금액: o.total_amount,
    배송비: o.delivery_fee_charged || 0,
    입금상태: o.payment_status,
    배송상태: o.delivery_status,
    주문일시: new Date(o.created_at).toLocaleString("ko-KR"),
  }));
  const deliverySheet = XLSX.utils.json_to_sheet(deliveryRows);

  // 3) 현장픽업 상세
  const pickupOrders = orders.filter((o) => o.fulfillment_type === "픽업");
  const pickupRows = pickupOrders.map((o) => ({
    닉네임: o.nickname,
    연락처: formatPhone(o.phone),
    결제방법: o.payment_method,
    주문상품: (o.order_items as any[])
      .map((i) => `${i.product_name_snapshot} x${i.quantity}`)
      .join(", "),
    결제금액: o.total_amount,
    입금상태: o.payment_status,
    수령상태: o.pickup_status || "",
    주문일시: new Date(o.created_at).toLocaleString("ko-KR"),
  }));
  const pickupSheet = XLSX.utils.json_to_sheet(pickupRows);

  // 4) 취소/환불 내역
  const cancelledRows = cancelledOrders.map((o) => ({
    닉네임: o.nickname,
    연락처: formatPhone(o.phone),
    구분: o.fulfillment_type,
    주문상품: (o.order_items as any[])
      .map((i) => `${i.product_name_snapshot} x${i.quantity}`)
      .join(", "),
    결제금액: o.total_amount,
    환불상태: o.refund_status || "-",
    취소일시: o.cancelled_at ? new Date(o.cancelled_at).toLocaleString("ko-KR") : "",
  }));
  const cancelledSheet = XLSX.utils.json_to_sheet(cancelledRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, "발주용 요약");
  XLSX.utils.book_append_sheet(workbook, deliverySheet, "문앞배송 상세");
  XLSX.utils.book_append_sheet(workbook, pickupSheet, "현장픽업 상세");
  XLSX.utils.book_append_sheet(workbook, cancelledSheet, "취소환불 내역");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="groupbuy_${id}.xlsx"`,
    },
  });
}
