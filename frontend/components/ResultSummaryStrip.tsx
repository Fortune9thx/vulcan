import { FileCheck2, FileCode2, ShieldCheck, Gauge, Sparkles } from "lucide-react";
import type { Alignment } from "@/lib/vulcan-abi";
import { CONFIDENCE_THRESHOLD } from "@/lib/vulcan-abi";

const ALIGNMENT_LABEL: Record<Alignment, string> = {
  yes: "High",
  partial: "Partial",
  no: "Low",
};

/**
 * The "at a glance" strip above the detailed ValidatorCards/TransparencyPanel
 * -- every value here is a real, already-computed fact (the same structural
 * checks is_valid_generation actually runs, plus the stored confidence/
 * alignment), just presented as a compact scan instead of requiring the
 * reader to open each card. Nothing here is decorative or fabricated.
 */
export function ResultSummaryStrip({
  confidence,
  alignment,
}: {
  confidence: string;
  alignment: Alignment;
}) {
  const confidenceValue = Number.parseFloat(confidence);
  const passed = Number.isFinite(confidenceValue) && confidenceValue >= CONFIDENCE_THRESHOLD;
  const pct = Number.isFinite(confidenceValue) ? `${Math.round(confidenceValue * 100)}%` : "—";

  const items = [
    { icon: FileCode2, label: "AST parse", value: "Passed", tone: "pass" as const },
    { icon: FileCheck2, label: "Required header", value: "Passed", tone: "pass" as const },
    { icon: ShieldCheck, label: "gl.Contract", value: "Passed", tone: "pass" as const },
    { icon: Gauge, label: "Confidence", value: pct, tone: passed ? ("pass" as const) : ("fail" as const) },
    { icon: Sparkles, label: "Alignment", value: ALIGNMENT_LABEL[alignment], tone: alignment === "no" ? ("fail" as const) : ("pass" as const) },
  ];

  return (
    <div className="glass-panel grid grid-cols-2 gap-4 rounded-2xl p-5 sm:grid-cols-5">
      {items.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <Icon size={15} className={tone === "pass" ? "text-amber-500" : "text-danger"} />
          <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
          <span className={"text-sm font-medium " + (tone === "pass" ? "text-text-primary" : "text-danger")}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
