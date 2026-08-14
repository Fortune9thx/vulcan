import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VULCAN — Prompt-to-Protocol Live Factory",
  description: "Describe it. Forge it. Deploy it under consensus.",
};

// Every route depends on client-side wallet state (RainbowKit/wagmi), so
// there's nothing meaningful to statically prerender -- and RainbowKit's
// getDefaultConfig throws at module-init time without a WalletConnect
// projectId, which would otherwise crash the build's static generation
// pass even though the app runs fine once a real projectId is set.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-void text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
