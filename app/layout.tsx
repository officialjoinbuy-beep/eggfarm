import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오더모아 - 공동구매 주문취합",
  description: "오픈채팅 수기취합은 이제 그만. 링크 하나로 주문취합/입금확인/QR수령/배송관리",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#171717",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased overflow-x-hidden">
      <body className="min-h-full w-full max-w-full overflow-x-hidden">{children}</body>
    </html>
  );
}
