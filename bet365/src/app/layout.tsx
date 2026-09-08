import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "bet365 — The Virtual Sportsbook",
  description:
    "A private, virtual-currency sportsbook. Real fixtures from ESPN, model-calculated odds, live in-play betting. Virtual euros only — no real money, ever.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
