import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buildRefinePrompt } from "@/lib/refine";

export function RefineButton({
  prompt,
  source,
  className,
}: {
  prompt: string;
  source: string;
  className?: string;
}) {
  const href = `/?prompt=${encodeURIComponent(buildRefinePrompt(prompt, source))}`;
  return (
    <Link
      href={href}
      className={
        className ??
        "flex items-center gap-1.5 font-mono text-xs text-text-secondary transition-colors hover:text-amber-400"
      }
    >
      <Sparkles size={13} />
      Forge a variant / Refine
    </Link>
  );
}
