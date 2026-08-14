"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Compass, Flame, Loader2, Rocket, Wallet } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { ParticleField } from "@/components/ParticleField";
import { DashboardStats } from "@/components/DashboardStats";
import { DashboardFilters } from "@/components/DashboardFilters";
import { GenerationCard } from "@/components/GenerationCard";
import { GenerationDetail } from "@/components/GenerationDetail";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useVulcanClient, getReadOnlyVulcanClient, fetchGenerationCount } from "@/lib/genlayer-client";
import {
  DASHBOARD_BATCH_SIZE,
  computeStats,
  fetchGenerationsWindow,
  fetchMyGenerations,
  filterAndSortEntries,
  nextIdWindow,
  type DashboardEntry,
  type DashboardSort,
  type DashboardTab,
} from "@/lib/dashboard-data";

export function DashboardClient() {
  const { client: walletClient, address } = useVulcanClient();
  // Reads never need a signer -- the same wallet-free client the public
  // /g/[id] page uses. Gating the whole page (including "All Forges") on
  // useVulcanClient's wallet-bound client would mean nobody without a
  // connected wallet could ever see the on-chain-only dashboard this
  // project's own docs describe as needing no wallet to browse.
  const readClient = getReadOnlyVulcanClient();
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [myEntries, setMyEntries] = useState<DashboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<DashboardTab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DashboardSort>("newest");
  const [selected, setSelected] = useState<DashboardEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);

  const loadAllBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await fetchGenerationCount(readClient);
      setTotalCount(count);
      const ids = nextIdWindow(count, 0);
      const batch = await fetchGenerationsWindow(readClient, ids);
      setEntries(batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load generations.");
    } finally {
      setLoading(false);
    }
  }, [readClient]);

  // "My Forges" is exact (Vulcan.user_generations), fetched independently
  // of the "All Forges" batch -- see docs/ARCHITECTURE.md for why this no
  // longer has the "of N loaded" caveat the all-forges stats still do.
  // Still needs a connected wallet -- not for the read itself (readClient
  // handles that), but to know which address's generations to look up.
  const loadMine = useCallback(async () => {
    if (!address) return;
    setLoadingMine(true);
    try {
      const mine = await fetchMyGenerations(readClient, address);
      setMyEntries(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your generations.");
    } finally {
      setLoadingMine(false);
    }
  }, [readClient, address]);

  const refreshAll = useCallback(() => {
    loadAllBatch();
    loadMine();
  }, [loadAllBatch, loadMine]);

  useEffect(() => {
    loadAllBatch();
  }, [loadAllBatch]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  // Deep-link support: ?open=<id> from the post-generate toast opens that
  // generation's detail drawer as soon as it shows up (it's always the
  // newest, so it's in both the first "all" batch and the "mine" index).
  useEffect(() => {
    if (!openId || openId === autoOpenedFor) return;
    const match = entries.find((e) => e.id === openId) ?? myEntries.find((e) => e.id === openId);
    if (match) {
      setSelected(match);
      setDetailOpen(true);
      setAutoOpenedFor(openId);
    }
  }, [openId, entries, myEntries, autoOpenedFor]);

  async function loadMore() {
    // The button's disabled={loadingMore} only takes effect after React
    // commits -- a fast double-click before that would otherwise call this
    // twice concurrently, both reading the same entries.length and
    // appending the same batch (duplicate keys, inflated "load more" count).
    if (totalCount === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const ids = nextIdWindow(totalCount, entries.length);
      const batch = await fetchGenerationsWindow(readClient, ids);
      setEntries((prev) => [...prev, ...batch]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more generations.");
    } finally {
      setLoadingMore(false);
    }
  }

  function handleDeployed(generationId: string, deployedAddress: string) {
    setEntries((prev) => prev.map((e) => (e.id === generationId ? { ...e, deployedAddress } : e)));
    setMyEntries((prev) => prev.map((e) => (e.id === generationId ? { ...e, deployedAddress } : e)));
    setSelected((prev) => (prev && prev.id === generationId ? { ...prev, deployedAddress } : prev));
  }

  const stats = computeStats(entries, myEntries, totalCount ?? 0);
  const baseEntries = tab === "mine" ? myEntries : entries;
  const visible = filterAndSortEntries(baseEntries, { tab, search, sort });
  const hasMore = totalCount !== null && entries.length < totalCount;
  const currentlyLoading = tab === "mine" ? loadingMine : loading;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <ParticleField state="idle" />
      <AppNav />

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:px-10">
        <div className="mb-6">
          <h1 className="font-serif text-3xl text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Every generation here is a real multi-validator consensus decision, read live from Vulcan
            on-chain — nothing on this page is cached off-chain.
          </p>
        </div>

        <DashboardStats stats={stats} onRefresh={refreshAll} refreshing={loading || loadingMine} />

        <div className="my-6">
          <DashboardFilters
            tab={tab}
            onTabChange={setTab}
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
          />
        </div>

        {error && <p className="mb-4 font-mono text-xs text-danger">{error}</p>}

        {tab === "mine" && !address ? (
          <EmptyState
            icon={Wallet}
            title="Connect your wallet"
            description="My Forges reads your on-chain generation index, which needs your address -- connect a wallet to see it."
          />
        ) : currentlyLoading && baseEntries.length === 0 ? (
          <SkeletonGrid />
        ) : visible.length === 0 ? (
          <EmptyStateForTab tab={tab} totalCount={totalCount ?? 0} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {visible.map((entry) => (
                  <GenerationCard
                    key={entry.id}
                    entry={entry}
                    myAddress={address}
                    onClick={() => {
                      setSelected(entry);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>

            {hasMore && tab === "all" && !search && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  {loadingMore
                    ? "Loading…"
                    : `Load ${Math.min(DASHBOARD_BATCH_SIZE, totalCount! - entries.length)} more`}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <GenerationDetail
        entry={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        client={walletClient}
        onDeployed={handleDeployed}
      />
    </div>
  );
}

function EmptyStateForTab({ tab, totalCount }: { tab: DashboardTab; totalCount: number }) {
  if (tab === "mine") {
    return (
      <EmptyState
        icon={Flame}
        title="No forges yet"
        description="You haven't forged a contract yet — describe one and watch consensus reach a decision on it."
        actionLabel="Create your first forge"
        href="/"
      />
    );
  }
  if (tab === "deployed") {
    return (
      <EmptyState
        icon={Rocket}
        title="Nothing deployed yet"
        description="Once a generation clears the confidence threshold, you can deploy it straight from its detail view."
      />
    );
  }
  return (
    <EmptyState
      icon={Compass}
      title={totalCount === 0 ? "VULCAN is quiet so far" : "No matches"}
      description={
        totalCount === 0
          ? "Nobody has forged a contract yet. Be the first."
          : "Try a different search or widen the current tab."
      }
      actionLabel={totalCount === 0 ? "Forge the first one" : undefined}
      href={totalCount === 0 ? "/" : undefined}
    />
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.08 }}
          className="glass-panel h-32 rounded-xl"
        />
      ))}
    </div>
  );
}
