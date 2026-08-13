"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, LayoutGrid } from "lucide-react";
import { WalletConnect } from "@/components/WalletConnect";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Forge", icon: Flame },
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="font-serif text-lg italic amber-gradient-text">
        VULCAN
      </Link>

      <nav className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.02] p-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-xs transition-colors",
                active ? "bg-amber-400/10 text-amber-400" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <Icon size={13} />
              {label}
            </Link>
          );
        })}
      </nav>

      <WalletConnect />
    </header>
  );
}
