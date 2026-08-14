import { CheckCircle2, CircleDashed, CircleHelp, XCircle } from "lucide-react";
import type { Alignment } from "@/lib/vulcan-abi";
import { isInconclusiveAlignment } from "@/lib/vulcan-abi";
import { cn } from "@/lib/utils";

const ALIGNMENT_CONFIG: Record<Alignment, { label: string; icon: typeof CheckCircle2; className: string }> = {
  yes: { label: "Aligned", icon: CheckCircle2, className: "bg-amber-400/10 text-amber-500" },
  partial: { label: "Partially aligned", icon: CircleDashed, className: "bg-amber-600/10 text-amber-600" },
  no: { label: "Not aligned", icon: XCircle, className: "bg-danger/10 text-danger" },
};

// "no" covers two very different situations that both default to the same
// stored value: the round genuinely judged the code a poor match, or the
// round simply never produced a usable result (a validator timeout/
// disagreement in that specific consensus round -- see parse_alignment in
// contracts/Vulcan.py). Confirmed live: a real 0.95-confidence, on-topic
// generation landed here, which would otherwise read as a real rejection
// it never actually got. alignmentReason is optional so existing callers
// that don't have it yet still compile -- they just can't make this
// distinction and fall back to the plain "Not aligned" reading.
const INCONCLUSIVE_CONFIG = {
  label: "Alignment inconclusive",
  icon: CircleHelp,
  className: "bg-black/[0.04] text-text-secondary",
};

export function AlignmentBadge({
  alignment,
  alignmentReason,
  className,
}: {
  alignment: Alignment;
  alignmentReason?: string;
  className?: string;
}) {
  const inconclusive = alignmentReason !== undefined && isInconclusiveAlignment(alignment, alignmentReason);
  const config = inconclusive ? INCONCLUSIVE_CONFIG : ALIGNMENT_CONFIG[alignment];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        config.className,
        className
      )}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
}
