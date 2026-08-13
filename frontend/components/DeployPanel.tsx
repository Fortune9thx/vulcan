"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, ExternalLink, Rocket } from "lucide-react";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";
import { ConsensusVisualizer } from "@/components/ConsensusVisualizer";
import { Button } from "@/components/ui/button";
import { useDeployGeneration } from "@/lib/useDeployGeneration";
import { CONFIDENCE_THRESHOLD, type GenerationRecord } from "@/lib/vulcan-abi";
import { cn, truncateAddress } from "@/lib/utils";

export function DeployPanel({
  client,
  generationId,
  record,
}: {
  client: GenLayerClient<GenLayerChain>;
  generationId: string;
  record: GenerationRecord;
}) {
  const [copied, setCopied] = useState(false);
  const { state, status, deployedAddress, error, deploy } = useDeployGeneration(client, generationId);

  const confidence = Number.parseFloat(record.confidence);
  const blocked = !Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLD;

  async function handleCopy() {
    await navigator.clipboard.writeText(record.source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (state === "done" && deployedAddress) {
    return <DeploySuccess address={deployedAddress} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-xl flex-col gap-5"
    >
      <div className="glass-panel rounded-2xl p-6 text-center">
        <h2 className="font-serif text-2xl italic text-text-primary">Finalize</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Copy the generated source, or deploy it directly to GenLayer Bradbury with your connected wallet.
        </p>

        {blocked && (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-xs text-danger">
            Confidence ({record.confidence}) is below the {CONFIDENCE_THRESHOLD} threshold — this
            generation cannot be marked deployed on-chain.
          </p>
        )}

        {state === "deploying" || state === "recording" ? (
          <div className="mt-6">
            <ConsensusVisualizer status={status} />
            {state === "recording" && (
              <p className="mt-2 font-mono text-xs text-text-muted">Recording deployment on Vulcan…</p>
            )}
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={handleCopy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy source"}
            </Button>
            <Button onClick={() => deploy(record.source)} disabled={blocked}>
              <Rocket size={15} />
              Deploy this contract
            </Button>
          </div>
        )}

        {error && <p className="mt-4 font-mono text-xs text-danger">{error}</p>}
      </div>
    </motion.div>
  );
}

function DeploySuccess({ address }: { address: string }) {
  const explorerUrl = testnetBradbury.blockExplorers?.default.url;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel relative mx-auto flex max-w-xl flex-col items-center gap-4 overflow-hidden rounded-2xl p-8 text-center"
    >
      <BurstParticles />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10"
      >
        <Rocket className="text-amber-400" size={24} />
      </motion.div>
      <h2 className="font-serif text-2xl italic amber-gradient-text">Deployed under consensus</h2>
      <p className="font-mono text-sm text-text-secondary">{truncateAddress(address, 8)}</p>
      {explorerUrl && (
        <a
          href={`${explorerUrl}address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:underline"
        >
          View on explorer
          <ExternalLink size={12} />
        </a>
      )}
    </motion.div>
  );
}

function BurstParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {particles.map((i) => {
          const angle = (i / particles.length) * Math.PI * 2;
          const distance = 90 + Math.random() * 60;
          return (
            <motion.span
              key={i}
              className={cn("absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-400")}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                opacity: 0,
              }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
