import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공동구매 주문취합",
  description: "공동구매 주문취합/입금확인/배송관리 셀프유즈 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
