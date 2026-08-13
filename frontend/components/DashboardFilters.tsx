"use client";

import { Search } from "lucide-react";
import type { DashboardSort, DashboardTab } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const TABS: { value: DashboardTab; label: string }[] = [
  { value: "mine", label: "My Forges" },
  { value: "all", label: "All Forges" },
  { value: "deployed", label: "Deployed only" },
];

const SORTS: { value: DashboardSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "confidence", label: "Highest confidence" },
  { value: "deployed", label: "Deployed first" },
];

export function DashboardFilters({
  tab,
  onTabChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  tabsDisabled,
}: {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: DashboardSort;
  onSortChange: (sort: DashboardSort) => void;
  tabsDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.02] p-1">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onTabChange(value)}
            disabled={tabsDisabled && value === "mine"}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-mono text-xs transition-colors disabled:opacity-40",
              tab === value ? "bg-amber-400/10 text-amber-400" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search prompts & summaries…"
            className="w-48 rounded-full border border-white/5 bg-white/[0.02] py-1.5 pl-8 pr-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-amber-400/30 focus:outline-none sm:w-64"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as DashboardSort)}
          className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 font-mono text-xs text-text-secondary focus:border-amber-400/30 focus:outline-none"
        >
          {SORTS.map(({ value, label }) => (
            <option key={value} value={value} className="bg-void-raised">
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
