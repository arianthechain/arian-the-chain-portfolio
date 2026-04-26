import type { Metadata } from "next";
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from "next/font/google";
import { config } from "@/lib/config";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000",
  ),
  title: `${config.profile.name} · Portfolio`,
  description: `On-chain portfolio of ${config.profile.name} (/u/${config.profile.handle})`,
  openGraph: {
    title: `${config.profile.name} · Portfolio`,
    description: `Live on-chain portfolio of ${config.profile.name}`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${config.profile.name} · Portfolio`,
    description: `Live on-chain portfolio of ${config.profile.name}`,
    creator: config.profile.twitter ? `@${config.profile.twitter}` : undefined,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
