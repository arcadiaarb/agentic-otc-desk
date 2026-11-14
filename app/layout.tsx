import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WalletProvider } from "@/components/wallet-provider";
import { Header } from "@/components/header";
import { SpotProvider } from "@/components/spot-provider";
import { SpotStrip } from "@/components/spot-strip";
import logo from "./logo/tacet_logo.webp";

export const metadata: Metadata = {
  title: "Tacet",
  description: "A private desk for over-the-counter trades on NEAR.",
  icons: { icon: logo.src, shortcut: logo.src, apple: logo.src },
};

// Dark by default; only switch to light if the user chose it.
const themeScript = `try{if(localStorage.getItem('tacet-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Unbounded:wght@400;500;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <WalletProvider>
          <SpotProvider>
            <Header />
            <SpotStrip />
            <main className="mx-auto w-full max-w-5xl px-5 pb-24">{children}</main>
          </SpotProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
