import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

export const metadata: Metadata = {
  title: "Facebook Rental Radar",
  description: "Rental lead radar for Facebook groups",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "رادار الإيجار",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
