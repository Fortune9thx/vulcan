"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { History } from "lucide-react";
import { ParticleField, type ParticleFieldState } from "@/components/ParticleField";
import { PromptStage } from "@/components/PromptStage";
import { GenerationStage } from "@/components/GenerationStage";
import { DeployPanel } from "@/components/DeployPanel";
import { WalletConnect } from "@/components/WalletConnect";
import { useVulcanClient, generateContract, fetchGenerationCount } from "@/lib/genlayer-client";
import type { GenerationRecord } from "@/lib/vulcan-abi";

type Stage = "prompt" | "consensus" | "deploy";

export function VulcanExperience() {
  const { client } = useVulcanClient();
  const [stage, setStage] = useState<Stage>("prompt");
  const [prompt, setPrompt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const particleState: ParticleFieldState =
    stage === "consensus" ? "consensus" : stage === "deploy" ? "active" : "idle";

  async function handleSubmit(nextPrompt: string) {
    if (!client) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const countBefore = await fetchGenerationCount(client);
      const hash = await generateContract(client, nextPrompt);
      setPrompt(nextPrompt);
      setGenerationId(String(countBefore));
      setTxHash(hash);
      setStage("consensus");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit the generation request.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setTxHash(null);
    setGenerationId(null);
    setRecord(null);
    setStage("prompt");
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <ParticleField state={particleState} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="font-serif text-lg italic amber-gradient-text">
          VULCAN
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/history"
            className="flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-xs text-text-secondary transition-colors hover:text-amber-400"
          >
            <History size={14} />
            History
          </Link>
          <WalletConnect />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10">
        <AnimatePresence mode="wait">
          {stage === "prompt" && (
            <PromptStage
              key="prompt"
              onSubmit={handleSubmit}
              disabled={!client || submitting}
              disabledReason={
                !client
                  ? "Connect your wallet to forge a contract."
                  : submitting
                    ? "Submitting to consensus…"
                    : undefined
              }
            />
          )}

          {stage === "consensus" && client && txHash && generationId !== null && (
            <GenerationStage
              key="consensus"
              client={client}
              prompt={prompt}
              txHash={txHash}
              generationId={generationId}
              onContinue={(finishedRecord) => {
                setRecord(finishedRecord);
                setStage("deploy");
              }}
              onRetry={handleRetry}
            />
          )}

          {stage === "deploy" && client && generationId !== null && record && (
            <DeployPanel key="deploy" client={client} generationId={generationId} record={record} />
          )}
        </AnimatePresence>

        {submitError && (
          <p className="mt-4 max-w-md text-center font-mono text-xs text-danger">{submitError}</p>
        )}
      </main>
    </div>
  );
}
