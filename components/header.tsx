"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useWallet } from "./wallet-provider";
import { btnGreen } from "@/lib/ui";

const short = (id: string) => (id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);

export function Header() {
  const { accountId, signedIn, ready, signingIn, authError, connect, disconnect, signIn } = useWallet();
  const [dark, setDark] = useState(true);
  const [menu, setMenu] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("tacet-theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  };

  // Mobile: everything except logo + name sits in a dropdown. sm and up: inline.
  const nav = `${menu ? "flex" : "hidden"} absolute inset-x-5 top-full z-30 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:static sm:flex sm:flex-row sm:items-center sm:gap-5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`;

  return (
    <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
      <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenu(false)}>
        <span className="size-6 rounded-full bg-green" aria-hidden />
        <span className="font-display text-lg font-bold tracking-tight">Tacet</span>
      </Link>
      <button onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="site-nav" className="text-text sm:hidden">
        {menu ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>
      <nav id="site-nav" className={nav}>
        <Link href="/intents" onClick={() => setMenu(false)} className="text-sm text-muted transition-colors hover:text-text">Intents</Link>
        {signedIn && <Link href="/my-intents" onClick={() => setMenu(false)} className="text-sm text-muted transition-colors hover:text-text">My Intents</Link>}
        <button onClick={toggle} className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-text">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          <span className="sm:sr-only">{dark ? "Light mode" : "Dark mode"}</span>
        </button>
        {accountId ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span title={accountId} className="rounded-full border border-line px-3.5 py-2 text-sm">{short(accountId)}</span>
              {!signedIn && <button onClick={signIn} disabled={signingIn} className={btnGreen}>{signingIn ? "Signing…" : "Sign in"}</button>}
              <button onClick={() => { setMenu(false); disconnect(); }} className="text-sm text-muted transition-colors hover:text-text">Disconnect</button>
            </div>
            {authError && <p role="alert" className="max-w-64 text-xs text-orange">{authError}</p>}
          </div>
        ) : (
          <button onClick={() => { setMenu(false); connect(); }} disabled={!ready} className={`${btnGreen} w-full sm:w-auto`}>Connect Wallet</button>
        )}
      </nav>
    </header>
  );
}
