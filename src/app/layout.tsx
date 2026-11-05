import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TradeCheck: export document compliance",
  description: "Catch trade-document discrepancies before customs, banks or buyers do.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Suspense fallback={<div className="no-print fixed inset-y-0 left-0 hidden w-60 bg-[#0b1220] lg:block" />}>
          <Sidebar />
        </Suspense>
        <div className="lg:pl-60 print:pl-0">
          <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
