import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공동구매 주문취합",
  description: "공동구매 주문취합/입금확인/배송관리 셀프유즈 도구",
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
