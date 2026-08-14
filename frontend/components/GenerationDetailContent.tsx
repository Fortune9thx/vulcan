"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Rocket } from "lucide-react";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";
import { AlignmentBadge } from "@/components/AlignmentBadge";
import { CodeViewer } from "@/components/CodeViewer";
import { ConsensusVisualizer } from "@/components/ConsensusVisualizer";
import { RefineButton } from "@/components/RefineButton";
import { ResultSummaryStrip } from "@/components/ResultSummaryStrip";
import { TransparencyPanel } from "@/components/TransparencyPanel";
import { Button } from "@/components/ui/button";
import { useDeployGeneration } from "@/lib/useDeployGeneration";
import { CONFIDENCE_THRESHOLD } from "@/lib/vulcan-abi";
import type { DashboardEntry } from "@/lib/dashboard-data";
import { truncateAddress } from "@/lib/utils";

/**
 * The full generation detail view -- prompt, summary/alignment, source,
 * deploy action, transparency panel. Shared between the dashboard's
 * detail drawer (GenerationDetail.tsx, wrapped in a Radix Dialog) and the
 * public /g/[id] page (no wallet required to view; the deploy button
 * itself still needs one, same as everywhere else deploy happens).
 */
export function GenerationDetailContent({
  entry,
  client,
  onDeployed,
}: {
  entry: DashboardEntry;
  client: GenLayerClient<GenLayerChain> | null;
  onDeployed?: (generationId: string, address: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const { state, status, deployedAddress, error, deploy } = useDeployGeneration(client, entry.id);

  useEffect(() => {
    if (state === "done" && deployedAddress) {
      onDeployed?.(entry.id, deployedAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, state, deployedAddress]);

  const confidence = Number.parseFloat(entry.confidence);
  const passed = Number.isFinite(confidence) && confidence >= CONFIDENCE_THRESHOLD;
  const alreadyDeployed = entry.deployedAddress.length > 0;
  const explorerUrl = testnetBradbury.blockExplorers?.default.url;

  async function handleCopy() {
    await navigator.clipboard.writeText(entry.source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Prompt</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{entry.prompt}</p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Summary</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{entry.summary || "No summary."}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`text-xs font-medium ${passed ? "text-amber-500" : "text-danger"}`}>
                confidence {entry.confidence}
              </span>
              <AlignmentBadge alignment={entry.alignment} alignmentReason={entry.alignmentReason} />
            </div>
            <p className="mt-2 text-xs text-text-muted">{entry.alignmentReason}</p>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Source</h3>
          <CodeViewer code={entry.source} className="glass-panel" />
        </div>
      </div>

      <ResultSummaryStrip
        confidence={entry.confidence}
        alignment={entry.alignment}
        alignmentReason={entry.alignmentReason}
      />

      <div className="glass-panel rounded-xl p-5">
        {alreadyDeployed || (state === "done" && deployedAddress) ? (
          <div>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">Deployed</h3>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-text-primary">
                {truncateAddress(deployedAddress ?? entry.deployedAddress, 8)}
              </span>
              {explorerUrl && (
                <a
                  href={`${explorerUrl}address/${deployedAddress ?? entry.deployedAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-xs text-amber-400 hover:underline"
                >
                  Explorer
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
            {alreadyDeployed && !(state === "done" && deployedAddress) && (
              <p className="mt-2 text-xs text-text-muted">
                Self-reported by the generation&apos;s original sender via mark_deployed — Vulcan
                doesn&apos;t independently verify this address holds this generation&apos;s bytecode.
              </p>
            )}
          </div>
        ) : state === "deploying" || state === "recording" ? (
          <div className="flex flex-col items-center py-2">
            <ConsensusVisualizer status={status} />
            {state === "recording" && (
              <p className="mt-2 font-mono text-xs text-text-muted">Recording deployment on Vulcan…</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!passed && (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-xs text-danger">
                Confidence is below the {CONFIDENCE_THRESHOLD} threshold — this generation can&apos;t be
                deployed.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy source"}
              </Button>
              <Button onClick={() => deploy(entry.source)} disabled={!passed || !client}>
                <Rocket size={14} />
                Deploy this contract
              </Button>
              <RefineButton prompt={entry.prompt} source={entry.source} />
            </div>
            {!client && <p className="font-mono text-xs text-text-muted">Connect your wallet to deploy.</p>}
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </div>
        )}
      </div>

      <TransparencyPanel />
    </div>
  );
}
