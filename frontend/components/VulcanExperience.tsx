"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { ParticleField, type ParticleFieldState } from "@/components/ParticleField";
import { PromptStage } from "@/components/PromptStage";
import { GenerationStage } from "@/components/GenerationStage";
import { DeployPanel } from "@/components/DeployPanel";
import { Toast } from "@/components/Toast";
import { useVulcanClient, generateContract, fetchGenerationCount } from "@/lib/genlayer-client";
import type { GenerationRecord } from "@/lib/vulcan-abi";

type Stage = "prompt" | "consensus" | "deploy";

export function VulcanExperience() {
  const { client, address } = useVulcanClient();
  const searchParams = useSearchParams();
  const defaultPrompt = searchParams.get("prompt") ?? undefined;

  const [stage, setStage] = useState<Stage>("prompt");
  const [prompt, setPrompt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastGenerationId, setToastGenerationId] = useState<string | null>(null);

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
      <AppNav />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10">
        <AnimatePresence mode="wait">
          {stage === "prompt" && (
            <PromptStage
              key="prompt"
              onSubmit={handleSubmit}
              defaultPrompt={defaultPrompt}
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

          {stage === "consensus" && client && address && txHash && generationId !== null && (
            <GenerationStage
              key="consensus"
              client={client}
              senderAddress={address}
              prompt={prompt}
              txHash={txHash}
              generationId={generationId}
              onContinue={(finishedRecord, resolvedGenerationId) => {
                setRecord(finishedRecord);
                setGenerationId(resolvedGenerationId);
                setStage("deploy");
                setToastGenerationId(resolvedGenerationId);
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

      <AnimatePresence>
        {toastGenerationId && (
          <Toast
            message="Forged successfully."
            actionLabel="View in Dashboard"
            actionHref={`/dashboard?open=${toastGenerationId}`}
            onDismiss={() => setToastGenerationId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
