"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { DashboardStats as Stats } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function DashboardStats({
  stats,
  onRefresh,
  refreshing,
}: {
  stats: Stats;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const tiles = [
    { label: "Total generations", value: stats.totalGenerations.toString() },
    { label: "My generations", value: stats.myCount.toString(), hint: `of ${stats.loadedCount} loaded` },
    { label: "Deployed", value: stats.deployedCount.toString(), hint: `of ${stats.loadedCount} loaded` },
    {
      label: "My avg. confidence",
      value: stats.myAverageConfidence !== null ? stats.myAverageConfidence.toFixed(2) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile, i) => (
        <motion.div
          key={tile.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="glass-panel rounded-xl px-4 py-3.5"
        >
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{tile.label}</p>
          <p className="mt-1 font-serif text-2xl italic text-text-primary">{tile.value}</p>
          {tile.hint && <p className="mt-0.5 font-mono text-[10px] text-text-muted">{tile.hint}</p>}
        </motion.div>
      ))}

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className={cn(
          "col-span-2 flex items-center justify-center gap-2 rounded-xl border border-amber-400/15 px-4 py-3.5",
          "font-mono text-xs text-text-secondary transition-colors hover:border-amber-400/40 hover:text-amber-400",
          "disabled:opacity-50 sm:col-span-4"
        )}
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
