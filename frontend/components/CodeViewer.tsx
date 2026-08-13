"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodeViewer({
  code,
  language = "python",
  filename,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("shiki").then(({ codeToHtml }) => {
      codeToHtml(code, { lang: language, theme: "vitesse-dark" }).then((result) => {
        if (!cancelled) setHtml(result);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={cn("code-viewer overflow-hidden rounded-lg", className)}>
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <span className="font-mono text-xs text-text-muted">{filename ?? `contract.${language}`}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-text-secondary transition-colors hover:bg-white/5 hover:text-amber-400"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-[480px] overflow-auto p-4 font-mono text-[13px] leading-relaxed">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap text-text-secondary">{code}</pre>
        )}
      </div>
    </div>
  );
}
