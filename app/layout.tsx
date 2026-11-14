import type { Metadata } from "next";
import { Archivo_Narrow, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const head = Archivo_Narrow({ variable: "--font-head", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Groundtruth — what's solid under every claim",
  description: "Claim-level credibility across six search engines.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${head.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
