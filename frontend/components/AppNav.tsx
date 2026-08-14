"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Forge" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="relative z-20 flex items-center justify-between border-b border-border px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3 w-3 rotate-45 rounded-[2px] bg-gradient-to-br from-amber-400 to-amber-600"
        />
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-text-primary">VULCAN</span>
      </Link>

      <nav className="flex items-center gap-8">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "border-b-2 pb-0.5 text-sm font-medium transition-colors",
                active
                  ? "border-amber-400 text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <WalletConnect />
    </header>
  );
}
