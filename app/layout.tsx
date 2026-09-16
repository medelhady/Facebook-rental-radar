import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facebook Rental Radar",
  description: "Rental lead radar for Facebook groups"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
