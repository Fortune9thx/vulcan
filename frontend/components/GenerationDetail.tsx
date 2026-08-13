"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink, Rocket, Sparkles, X } from "lucide-react";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";
import { CodeViewer } from "@/components/CodeViewer";
import { ConsensusVisualizer } from "@/components/ConsensusVisualizer";
import { Button } from "@/components/ui/button";
import { markDeployedOnChain, pollConsensusStatus } from "@/lib/genlayer-client";
import { CONFIDENCE_THRESHOLD } from "@/lib/vulcan-abi";
import type { DashboardEntry } from "@/lib/dashboard-data";
import { truncateAddress } from "@/lib/utils";

type DeployState = "idle" | "deploying" | "recording" | "done" | "error";

export function GenerationDetail({
  entry,
  open,
  onOpenChange,
  client,
  onDeployed,
}: {
  entry: DashboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: GenLayerClient<GenLayerChain> | null;
  onDeployed: (generationId: string, address: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.PENDING);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  const confidence = Number.parseFloat(entry.confidence);
  const passed = Number.isFinite(confidence) && confidence >= CONFIDENCE_THRESHOLD;
  const alreadyDeployed = entry.deployedAddress.length > 0;
  const explorerUrl = testnetBradbury.blockExplorers?.default.url;

  async function handleCopy() {
    await navigator.clipboard.writeText(entry!.source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function handleDeploy() {
    if (!client) return;
    setDeployState("deploying");
    setError(null);
    try {
      const deployHash = await client.deployContract({ code: entry!.source });
      const finalTx = await pollConsensusStatus(client, deployHash, ({ status }) => setStatus(status));

      if (finalTx.statusName !== TransactionStatus.FINALIZED && finalTx.statusName !== TransactionStatus.ACCEPTED) {
        throw new Error("Deployment did not reach consensus.");
      }
      const address = finalTx.to_address ?? finalTx.recipient;
      if (!address) throw new Error("Deployment succeeded but no contract address was returned.");

      setDeployState("recording");
      await markDeployedOnChain(client, entry!.id, address);

      onDeployed(entry!.id, address);
      setDeployState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed.");
      setDeployState("error");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto border-l border-white/10 bg-void-raised p-6 shadow-2xl focus:outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-2xl italic text-text-primary">
                Generation #{entry.id}
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-xs text-text-muted">
                {truncateAddress(entry.sender, 6)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-6 flex flex-col gap-5">
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">Prompt</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{entry.prompt}</p>
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">Summary</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{entry.summary || "No summary."}</p>
              <p className={`mt-2 font-mono text-xs ${passed ? "text-amber-400" : "text-danger"}`}>
                confidence {entry.confidence}
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">Source</h3>
              <CodeViewer code={entry.source} className="glass-panel" />
            </div>

            <div className="glass-panel rounded-xl p-5">
              {alreadyDeployed ? (
                <div>
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                    Deployed
                  </h3>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-text-primary">
                      {truncateAddress(entry.deployedAddress, 8)}
                    </span>
                    {explorerUrl && (
                      <a
                        href={`${explorerUrl}address/${entry.deployedAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-mono text-xs text-amber-400 hover:underline"
                      >
                        Explorer
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              ) : deployState === "deploying" || deployState === "recording" ? (
                <div className="flex flex-col items-center py-2">
                  <ConsensusVisualizer status={status} />
                  {deployState === "recording" && (
                    <p className="mt-2 font-mono text-xs text-text-muted">Recording deployment on Vulcan…</p>
                  )}
                </div>
              ) : deployState === "done" ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center font-mono text-sm text-amber-400"
                >
                  Deployed and recorded.
                </motion.p>
              ) : (
                <div className="flex flex-col gap-3">
                  {!passed && (
                    <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-xs text-danger">
                      Confidence is below the {CONFIDENCE_THRESHOLD} threshold — this generation can&apos;t
                      be deployed.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={handleCopy}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Copied" : "Copy source"}
                    </Button>
                    <Button onClick={handleDeploy} disabled={!passed || !client}>
                      <Rocket size={14} />
                      Deploy this contract
                    </Button>
                    <a
                      href={`/?prompt=${encodeURIComponent(entry.prompt)}`}
                      className="flex items-center gap-1.5 font-mono text-xs text-text-secondary transition-colors hover:text-amber-400"
                    >
                      <Sparkles size={13} />
                      Forge a variant
                    </a>
                  </div>
                  {!client && (
                    <p className="font-mono text-xs text-text-muted">Connect your wallet to deploy.</p>
                  )}
                  {error && <p className="font-mono text-xs text-danger">{error}</p>}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
