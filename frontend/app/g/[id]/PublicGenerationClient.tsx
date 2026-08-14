"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { AppNav } from "@/components/AppNav";
import { ParticleField } from "@/components/ParticleField";
import { GenerationDetailContent } from "@/components/GenerationDetailContent";
import { fetchDeployedAddress, fetchGeneration, getReadOnlyVulcanClient, useVulcanClient } from "@/lib/genlayer-client";
import type { DashboardEntry } from "@/lib/dashboard-data";

export function PublicGenerationClient({ id }: { id: string }) {
  const { client: walletClient } = useVulcanClient();
  const readOnlyClient = useMemo(() => getReadOnlyVulcanClient(), []);

  const [entry, setEntry] = useState<DashboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [record, deployedAddress] = await Promise.all([
          fetchGeneration(readOnlyClient, id),
          fetchDeployedAddress(readOnlyClient, id),
        ]);
        if (cancelled) return;
        if (!record) {
          setError("No generation found with this id.");
          return;
        }
        setEntry({ ...record, id, deployedAddress });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this generation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readOnlyClient, id]);

  function handleDeployed(generationId: string, deployedAddress: string) {
    setEntry((prev) => (prev && prev.id === generationId ? { ...prev, deployedAddress } : prev));
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <ParticleField state="idle" />
      <AppNav />

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-6 py-8 sm:px-10">
        {loading ? (
          <div className="flex items-center gap-2 font-mono text-sm text-text-muted">
            <Loader2 className="animate-spin" size={16} />
            Loading generation #{id}…
          </div>
        ) : error || !entry ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-panel mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl px-8 py-14 text-center"
          >
            <AlertTriangle className="text-danger" size={24} />
            <p className="text-sm text-text-secondary">{error ?? "Generation not found."}</p>
          </motion.div>
        ) : (
          <>
            <h1 className="mb-6 font-serif text-3xl italic text-text-primary">Generation #{entry.id}</h1>
            <GenerationDetailContent entry={entry} client={walletClient} onDeployed={handleDeployed} />
          </>
        )}
      </main>
    </div>
  );
}
