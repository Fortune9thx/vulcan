"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CircleCheck, Loader2 } from "lucide-react";
import { ParticleField } from "@/components/ParticleField";
import { WalletConnect } from "@/components/WalletConnect";
import {
  useVulcanClient,
  fetchDeployedAddress,
  fetchGeneration,
  fetchGenerationCount,
} from "@/lib/genlayer-client";
import { CONFIDENCE_THRESHOLD, type GenerationRecord } from "@/lib/vulcan-abi";
import { truncateAddress } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  record: GenerationRecord;
  deployedAddress: string;
}

export default function HistoryPage() {
  const { client } = useVulcanClient();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    (async () => {
      try {
        const count = await fetchGenerationCount(client);
        const ids = Array.from({ length: count }, (_, i) => String(count - 1 - i));
        const loaded = await Promise.all(
          ids.map(async (id) => {
            const [record, deployedAddress] = await Promise.all([
              fetchGeneration(client, id),
              fetchDeployedAddress(client, id),
            ]);
            return record ? { id, record, deployedAddress } : null;
          })
        );
        if (!cancelled) setEntries(loaded.filter((e): e is HistoryEntry => e !== null));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <ParticleField state="idle" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-mono text-xs text-text-secondary transition-colors hover:text-amber-400"
        >
          <ArrowLeft size={14} />
          Back to forge
        </Link>
        <WalletConnect />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <h1 className="mb-6 font-serif text-3xl italic text-text-primary">Generation History</h1>

        {!client && (
          <p className="font-mono text-sm text-text-muted">Connect your wallet to view past generations.</p>
        )}

        {client && !entries && !error && (
          <div className="flex items-center gap-2 font-mono text-sm text-text-muted">
            <Loader2 className="animate-spin" size={16} />
            Loading generations…
          </div>
        )}

        {error && <p className="font-mono text-sm text-danger">{error}</p>}

        {entries && entries.length === 0 && (
          <p className="font-mono text-sm text-text-muted">No generations yet — forge the first one.</p>
        )}

        <div className="flex flex-col gap-3">
          {entries?.map((entry, index) => {
            const confidence = Number.parseFloat(entry.record.confidence);
            const passed = Number.isFinite(confidence) && confidence >= CONFIDENCE_THRESHOLD;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="glass-panel rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{entry.record.prompt}</p>
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {entry.record.summary || "No summary."}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                    #{entry.id}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4 font-mono text-[11px] text-text-muted">
                  <span className={passed ? "text-amber-400" : "text-danger"}>
                    confidence {entry.record.confidence}
                  </span>
                  {entry.deployedAddress ? (
                    <span className="flex items-center gap-1 text-amber-400">
                      <CircleCheck size={12} />
                      deployed at {truncateAddress(entry.deployedAddress)}
                    </span>
                  ) : (
                    <span>not deployed</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
