import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNav } from "@/components/top-nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Goldbit - GoldOrbit",
  description: "SOXL Infinite Buying V4.0 management dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AppSidebar />
        <TopNav />
        <main className="px-5 py-6 lg:ml-64">{children}</main>
      </body>
    </html>
  );
}
