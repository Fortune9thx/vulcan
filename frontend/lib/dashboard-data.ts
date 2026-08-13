import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { fetchDeployedAddress, fetchGeneration } from "./genlayer-client";
import type { GenerationRecord } from "./vulcan-abi";

export const DASHBOARD_BATCH_SIZE = 16;

export interface DashboardEntry extends GenerationRecord {
  id: string;
  deployedAddress: string;
}

/**
 * Returns the next batch of generation ids to fetch, newest-first, given how
 * many have already been loaded. Reads walk backwards from the highest id
 * (count - 1) so the dashboard never has to scan the whole history to show
 * recent activity -- "Load more" simply extends the window further back.
 */
export function nextIdWindow(totalCount: number, alreadyLoaded: number, batchSize = DASHBOARD_BATCH_SIZE): string[] {
  const start = totalCount - 1 - alreadyLoaded;
  if (start < 0) return [];
  const end = Math.max(-1, start - batchSize);
  const ids: string[] = [];
  for (let i = start; i > end; i--) {
    ids.push(String(i));
  }
  return ids;
}

export async function fetchGenerationsWindow(
  client: GenLayerClient<GenLayerChain>,
  ids: string[]
): Promise<DashboardEntry[]> {
  const results = await Promise.all(
    ids.map(async (id) => {
      const [record, deployedAddress] = await Promise.all([
        fetchGeneration(client, id),
        fetchDeployedAddress(client, id),
      ]);
      if (!record) return null;
      return { ...record, id, deployedAddress };
    })
  );
  return results.filter((entry): entry is DashboardEntry => entry !== null);
}

export interface DashboardStats {
  totalGenerations: number;
  loadedCount: number;
  myCount: number;
  deployedCount: number;
  myAverageConfidence: number | null;
}

/**
 * Stats are computed from whatever's been loaded so far, not a full scan of
 * every generation ever made -- there's no off-chain index to query "all of
 * mine" cheaply, and scanning the entire history up front would defeat the
 * point of batched loading. totalGenerations alone comes from get_count()
 * and is always exact; the rest grow more accurate as more batches load.
 */
export function computeStats(entries: DashboardEntry[], totalGenerations: number, myAddress?: string): DashboardStats {
  const mine = myAddress
    ? entries.filter((e) => e.sender.toLowerCase() === myAddress.toLowerCase())
    : [];
  const deployed = entries.filter((e) => e.deployedAddress.length > 0);
  const myConfidences = mine
    .map((e) => Number.parseFloat(e.confidence))
    .filter((c) => Number.isFinite(c));

  return {
    totalGenerations,
    loadedCount: entries.length,
    myCount: mine.length,
    deployedCount: deployed.length,
    myAverageConfidence:
      myConfidences.length > 0 ? myConfidences.reduce((a, b) => a + b, 0) / myConfidences.length : null,
  };
}

export type DashboardTab = "mine" | "all" | "deployed";
export type DashboardSort = "newest" | "confidence" | "deployed";

export function filterAndSortEntries(
  entries: DashboardEntry[],
  { tab, search, sort, myAddress }: { tab: DashboardTab; search: string; sort: DashboardSort; myAddress?: string }
): DashboardEntry[] {
  let filtered = entries;

  if (tab === "mine" && myAddress) {
    filtered = filtered.filter((e) => e.sender.toLowerCase() === myAddress.toLowerCase());
  } else if (tab === "deployed") {
    filtered = filtered.filter((e) => e.deployedAddress.length > 0);
  }

  const query = search.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter(
      (e) => e.prompt.toLowerCase().includes(query) || e.summary.toLowerCase().includes(query)
    );
  }

  const sorted = [...filtered];
  if (sort === "confidence") {
    sorted.sort((a, b) => Number.parseFloat(b.confidence) - Number.parseFloat(a.confidence));
  } else if (sort === "deployed") {
    sorted.sort((a, b) => Number(b.deployedAddress.length > 0) - Number(a.deployedAddress.length > 0));
  } else {
    sorted.sort((a, b) => Number(b.id) - Number(a.id));
  }
  return sorted;
}
