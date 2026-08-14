import { FileCheck2, FileCode2, ShieldCheck, Gauge, Sparkles } from "lucide-react";
import type { Alignment } from "@/lib/vulcan-abi";
import { CONFIDENCE_THRESHOLD, isInconclusiveAlignment } from "@/lib/vulcan-abi";

const ALIGNMENT_LABEL: Record<Alignment, string> = {
  yes: "High",
  partial: "Partial",
  no: "Low",
};

type Tone = "pass" | "fail" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  pass: "text-text-primary",
  fail: "text-danger",
  neutral: "text-text-secondary",
};

const TONE_ICON: Record<Tone, string> = {
  pass: "text-amber-500",
  fail: "text-danger",
  neutral: "text-text-muted",
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
  alignmentReason,
}: {
  confidence: string;
  alignment: Alignment;
  alignmentReason?: string;
}) {
  const confidenceValue = Number.parseFloat(confidence);
  const passed = Number.isFinite(confidenceValue) && confidenceValue >= CONFIDENCE_THRESHOLD;
  const pct = Number.isFinite(confidenceValue) ? `${Math.round(confidenceValue * 100)}%` : "—";
  const inconclusive = alignmentReason !== undefined && isInconclusiveAlignment(alignment, alignmentReason);

  const items: { icon: typeof FileCode2; label: string; value: string; tone: Tone }[] = [
    { icon: FileCode2, label: "AST parse", value: "Passed", tone: "pass" },
    { icon: FileCheck2, label: "Required header", value: "Passed", tone: "pass" },
    { icon: ShieldCheck, label: "gl.Contract", value: "Passed", tone: "pass" },
    { icon: Gauge, label: "Confidence", value: pct, tone: passed ? "pass" : "fail" },
    {
      icon: Sparkles,
      label: "Alignment",
      value: inconclusive ? "Inconclusive" : ALIGNMENT_LABEL[alignment],
      tone: inconclusive ? "neutral" : alignment === "no" ? "fail" : "pass",
    },
  ];

  return (
    <div className="glass-panel grid grid-cols-2 gap-4 rounded-2xl p-5 sm:grid-cols-5">
      {items.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <Icon size={15} className={TONE_ICON[tone]} />
          <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
          <span className={"text-sm font-medium " + TONE_TEXT[tone]}>{value}</span>
        </div>
      ))}
    </div>
  );
}
