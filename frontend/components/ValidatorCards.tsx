"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Crown, ShieldCheck, Sparkle } from "lucide-react";
import { AlignmentBadge } from "@/components/AlignmentBadge";
import { cn } from "@/lib/utils";
import { CONFIDENCE_THRESHOLD, isInconclusiveAlignment, type Alignment } from "@/lib/vulcan-abi";

const STRUCTURAL_CHECKS = [
  "Required imports and pinned runner header present",
  "Every method carries a legal @gl.public.* decorator",
  "No bare list[] / dict[] storage types",
  `Reported confidence at or above ${CONFIDENCE_THRESHOLD}`,
];

export function ValidatorCards({
  summary,
  confidence,
  alignment,
  alignmentReason,
}: {
  summary: string;
  confidence: string;
  alignment: Alignment;
  alignmentReason: string;
}) {
  const confidenceValue = Number.parseFloat(confidence);
  const passed = Number.isFinite(confidenceValue) && confidenceValue >= CONFIDENCE_THRESHOLD;
  const inconclusive = isInconclusiveAlignment(alignment, alignmentReason);

  return (
    <div className="flex flex-col gap-2">
      <Card
        icon={<Crown size={15} className="text-amber-400" />}
        title="Leader"
        subtitle={summary || "No summary provided."}
        badge={passed ? "Proposed" : "Below threshold"}
        badgeTone={passed ? "amber" : "danger"}
        defaultOpen
      >
        <p className="text-sm text-text-secondary">{summary || "No summary was returned for this generation."}</p>
        <ConfidenceMeter value={confidenceValue} />
      </Card>

      <Card
        icon={<Sparkle size={15} className="text-amber-400" />}
        title="Alignment judgment"
        subtitle={alignmentReason || "No reasoning was provided."}
        badge={
          inconclusive
            ? "Inconclusive"
            : alignment === "yes"
              ? "Aligned"
              : alignment === "partial"
                ? "Partial"
                : "Not aligned"
        }
        badgeTone={inconclusive ? "neutral" : alignment === "no" ? "danger" : "amber"}
        defaultOpen
      >
        <p className="mb-2 text-xs text-text-muted">
          A second, independent consensus round (gl.eq_principle.prompt_non_comparative) judged whether
          this source reasonably attempts the request — a real check, distinct from the structural gate
          below, but still a self-reported judgment surfaced transparently, not a guarantee the code is
          bug-free.
          {inconclusive &&
            " This particular round didn't produce a usable result (the same kind of validator " +
              "timeout/disagreement that can affect any consensus round) rather than judging the code a " +
              "poor match -- the two default to the same stored value, but mean different things."}
        </p>
        <div className="flex items-center gap-2">
          <AlignmentBadge alignment={alignment} alignmentReason={alignmentReason} />
        </div>
        <p className="mt-2 text-sm text-text-secondary">{alignmentReason}</p>
      </Card>

      {[1, 2, 3, 4].map((n) => (
        <Card
          key={n}
          icon={<ShieldCheck size={15} className={passed ? "text-amber-400" : "text-danger"} />}
          title={`Validator ${n}`}
          subtitle={
            passed
              ? "Ran the same objective structural check on the leader's proposal and agreed."
              : "Ran the same objective structural check on the leader's proposal and rejected it."
          }
          badge={passed ? "Agreed" : "Disagreed"}
          badgeTone={passed ? "amber" : "danger"}
        >
          <p className="mb-2 text-xs text-text-muted">
            GenLayer doesn&apos;t expose individual validator reasoning through the client API, so this
            reflects the same real structural gate every validator runs against the leader&apos;s output
            (not fabricated per-validator commentary):
          </p>
          <ul className="flex flex-col gap-1.5">
            {STRUCTURAL_CHECKS.map((check) => (
              <li key={check} className="flex items-center gap-2 text-xs text-text-secondary">
                <span className={cn("h-1 w-1 rounded-full", passed ? "bg-amber-400" : "bg-danger")} />
                {check}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-text-muted">
        <span>Confidence</span>
        <span>{Number.isFinite(value) ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  subtitle,
  badge,
  badgeTone,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: "amber" | "danger" | "neutral";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass-panel rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{title}</p>
            <p className="truncate text-xs text-text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              badgeTone === "amber"
                ? "bg-amber-400/10 text-amber-500"
                : badgeTone === "neutral"
                  ? "bg-black/[0.04] text-text-secondary"
                  : "bg-danger/10 text-danger"
            )}
          >
            {badge}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} className="text-text-muted" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
