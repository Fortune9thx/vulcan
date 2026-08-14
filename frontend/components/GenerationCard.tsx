"use client";

import { motion } from "framer-motion";
import { CircleCheck } from "lucide-react";
import { AlignmentBadge } from "@/components/AlignmentBadge";
import type { DashboardEntry } from "@/lib/dashboard-data";
import { CONFIDENCE_THRESHOLD } from "@/lib/vulcan-abi";
import { cn, truncateAddress } from "@/lib/utils";

export function GenerationCard({
  entry,
  myAddress,
  onClick,
}: {
  entry: DashboardEntry;
  myAddress?: string;
  onClick: () => void;
}) {
  const confidence = Number.parseFloat(entry.confidence);
  const passed = Number.isFinite(confidence) && confidence >= CONFIDENCE_THRESHOLD;
  const isMine = myAddress && entry.sender.toLowerCase() === myAddress.toLowerCase();
  const deployed = entry.deployedAddress.length > 0;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="glass-panel group flex flex-col gap-3 rounded-xl p-4 text-left transition-colors hover:border-amber-400/30"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-text-primary">{entry.prompt}</p>
        <ConfidenceRing value={confidence} passed={passed} />
      </div>

      <p className="line-clamp-1 text-xs text-text-muted">{entry.summary || "No summary."}</p>

      <AlignmentBadge alignment={entry.alignment} className="self-start" />

      <div className="mt-auto flex items-center justify-between gap-2 font-mono text-[10px] text-text-muted">
        <span className="rounded-full bg-black/[0.04] px-2 py-0.5">#{entry.id}</span>
        <span>{isMine ? "You" : truncateAddress(entry.sender)}</span>
        {deployed ? (
          <span className="flex items-center gap-1 text-amber-400">
            <CircleCheck size={11} />
            {truncateAddress(entry.deployedAddress)}
          </span>
        ) : (
          <span>Not deployed</span>
        )}
      </div>
    </motion.button>
  );
}

function ConfidenceRing({ value, passed }: { value: number; passed: boolean }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx={18} cy={18} r={radius} fill="none" stroke="rgba(23,23,28,0.08)" strokeWidth={3} />
        <circle
          cx={18}
          cy={18}
          r={radius}
          fill="none"
          stroke={passed ? "#D4922A" : "#C62828"}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("absolute font-mono text-[9px]", passed ? "text-amber-400" : "text-danger")}>
        {Number.isFinite(value) ? Math.round(pct * 100) : "—"}
      </span>
    </div>
  );
}
