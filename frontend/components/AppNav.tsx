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
    <header className="relative z-20 flex items-center justify-between border-b border-border px-6 py-5 sm:px-10">
      <Link href="/" className="font-serif text-lg italic text-text-primary">
        VULCAN
      </Link>

      <nav className="flex items-center gap-1 rounded-full border border-border bg-void-raised p-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-text-primary text-void-raised" : "text-text-secondary hover:text-text-primary"
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
