import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Quant Tools — Plain English to Pine Script & MQL5",
    template: "%s · Quant Tools",
  },
  description:
    "Describe your trading strategy in plain English and get working TradingView Pine Script v6 or MetaTrader 5 MQL5 code, written and checked by a six-agent pipeline. Copy, paste, trade.",
  applicationName: "Quant Tools",
  keywords: [
    "Pine Script generator",
    "MQL5 generator",
    "TradingView indicator",
    "TradingView strategy",
    "MetaTrader 5 Expert Advisor",
    "trading strategy code",
  ],
  openGraph: {
    title: "Quant Tools — Plain English to Pine Script & MQL5",
    description:
      "Describe your strategy in plain English. Get working Pine Script v6 or MQL5 code with stop loss, take profit and position sizing built in.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
