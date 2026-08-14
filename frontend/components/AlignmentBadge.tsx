import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Alignment } from "@/lib/vulcan-abi";
import { cn } from "@/lib/utils";

const ALIGNMENT_CONFIG: Record<Alignment, { label: string; icon: typeof CheckCircle2; className: string }> = {
  yes: { label: "Aligned", icon: CheckCircle2, className: "bg-amber-400/10 text-amber-400" },
  partial: { label: "Partially aligned", icon: CircleDashed, className: "bg-amber-600/10 text-amber-600" },
  no: { label: "Not aligned", icon: XCircle, className: "bg-danger/10 text-danger" },
};

export function AlignmentBadge({ alignment, className }: { alignment: Alignment; className?: string }) {
  const config = ALIGNMENT_CONFIG[alignment];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        config.className,
        className
      )}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
}
