"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, LayoutGrid, RotateCcw } from "lucide-react";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerChain, GenLayerClient, GenLayerTransaction } from "genlayer-js/types";
import { ConsensusVisualizer } from "@/components/ConsensusVisualizer";
import { CodeViewer } from "@/components/CodeViewer";
import { RefineButton } from "@/components/RefineButton";
import { ResultSummaryStrip } from "@/components/ResultSummaryStrip";
import { TransparencyPanel } from "@/components/TransparencyPanel";
import { ValidatorCards } from "@/components/ValidatorCards";
import { Button } from "@/components/ui/button";
import { fetchGeneration, pollConsensusStatus, resolveGenerationId } from "@/lib/genlayer-client";
import type { GenerationRecord } from "@/lib/vulcan-abi";

export function GenerationStage({
  client,
  senderAddress,
  prompt,
  txHash,
  generationId,
  onContinue,
  onRetry,
}: {
  client: GenLayerClient<GenLayerChain>;
  senderAddress: string;
  prompt: string;
  txHash: `0x${string}`;
  generationId: string;
  onContinue: (record: GenerationRecord, resolvedGenerationId: string) => void;
  onRetry: () => void;
}) {
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.PENDING);
  const [transaction, setTransaction] = useState<GenLayerTransaction | null>(null);
  const [record, setRecord] = useState<GenerationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const resolvedIdRef = useRef(generationId);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    (async () => {
      try {
        const finalTx = await pollConsensusStatus(
          client,
          txHash,
          ({ status, transaction }) => {
            if (cancelled) return;
            setStatus(status);
            setTransaction(transaction);
          },
          { isCancelled: () => cancelled }
        );

        if (cancelled) return;

        if (finalTx.statusName === TransactionStatus.UNDETERMINED) {
          setError("Validators could not reach consensus on this generation.");
          return;
        }
        if (finalTx.statusName === TransactionStatus.CANCELED) {
          setError("The transaction was canceled.");
          return;
        }
        if (finalTx.statusName === TransactionStatus.LEADER_TIMEOUT) {
          setError("The leader timed out producing a result. Try again.");
          return;
        }
        if (finalTx.statusName === TransactionStatus.VALIDATORS_TIMEOUT) {
          setError("Validators timed out reaching consensus on this generation. Try again.");
          return;
        }

        // generation_id is assigned during the transaction's own execution,
        // not at submission time -- if another generate() call landed in
        // between, the id guessed before submitting could be wrong.
        const resolvedId = await resolveGenerationId(client, { guessedId: generationId, prompt, senderAddress });
        if (cancelled) return;
        resolvedIdRef.current = resolvedId;

        const fetched = await fetchGeneration(client, resolvedId);
        if (cancelled) return;
        if (!fetched) {
          setError("Consensus succeeded but the generation record could not be read back.");
          return;
        }
        setRecord(fetched);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong while watching consensus.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, txHash, generationId, prompt, senderAddress]);

  const failed = status === TransactionStatus.UNDETERMINED || status === TransactionStatus.CANCELED || !!error;

  if (!record && !failed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex flex-col items-center gap-2 py-10"
      >
        <ConsensusVisualizer status={status} transaction={transaction} />
      </motion.div>
    );
  }

  if (failed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center"
      >
        <AlertTriangle className="text-danger" size={28} />
        <p className="text-text-secondary">{error ?? "Consensus was not reached for this generation."}</p>
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw size={14} />
          Try again
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8"
    >
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Generation successful
        </p>
        <h1 className="font-serif text-4xl leading-tight tracking-tight text-text-primary sm:text-5xl">
          Contract generated successfully.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
          VULCAN forged a contract under real multi-validator consensus and validated it against
          {" "}{prompt.length > 60 ? "your request" : `"${prompt}"`}.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Original prompt
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">{prompt}</p>
        </div>
        <CodeViewer code={record!.source} className="glass-panel" />
      </div>

      <ResultSummaryStrip
        confidence={record!.confidence}
        alignment={record!.alignment}
        alignmentReason={record!.alignmentReason}
      />

      <ValidatorCards
        summary={record!.summary}
        confidence={record!.confidence}
        alignment={record!.alignment}
        alignmentReason={record!.alignmentReason}
      />

      <TransparencyPanel />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/dashboard?open=${resolvedIdRef.current}`}
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <LayoutGrid size={14} />
          View in Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <RefineButton prompt={prompt} source={record!.source} />
          <Button size="lg" onClick={() => onContinue(record!, resolvedIdRef.current)}>
            Continue to deploy
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
