import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { fetchDeployedAddress, fetchGeneration, fetchUserGenerationIds } from "./genlayer-client";
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
 * Used for the "All Forges"/"Deployed only" tabs, which have no per-user
 * index to consult.
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

/**
 * "My Forges", made exact via Vulcan.user_generations (Vulcan.py's
 * on-chain personal index) instead of the batched-scan approximation
 * fetchGenerationsWindow uses for "All Forges" -- a user's own generation
 * count is small enough that fetching all of them directly is cheap, and
 * it means "My Forges" is never limited to whatever the "All Forges" tab
 * happened to have loaded.
 */
export async function fetchMyGenerations(
  client: GenLayerClient<GenLayerChain>,
  userAddress: string
): Promise<DashboardEntry[]> {
  const ids = await fetchUserGenerationIds(client, userAddress);
  const entries = await Promise.all(
    ids.map(async (id) => {
      const [record, deployedAddress] = await Promise.all([
        fetchGeneration(client, id),
        fetchDeployedAddress(client, id),
      ]);
      if (!record) return null;
      return { ...record, id, deployedAddress };
    })
  );
  return entries.filter((entry): entry is DashboardEntry => entry !== null).reverse(); // newest first
}

export interface DashboardStats {
  totalGenerations: number;
  loadedCount: number;
  myCount: number;
  deployedCount: number;
  myAverageConfidence: number | null;
}

/**
 * totalGenerations (get_count()) and myCount/myAverageConfidence (the
 * on-chain personal index) are always exact. deployedCount is still
 * computed from whatever's currently loaded in the "All Forges" batch --
 * there's no on-chain "deployed" index, and scanning the entire history
 * up front to make it exact would defeat the point of batched loading.
 */
export function computeStats(
  loadedEntries: DashboardEntry[],
  myEntries: DashboardEntry[],
  totalGenerations: number
): DashboardStats {
  const deployed = loadedEntries.filter((e) => e.deployedAddress.length > 0);
  const myConfidences = myEntries.map((e) => Number.parseFloat(e.confidence)).filter((c) => Number.isFinite(c));

  return {
    totalGenerations,
    loadedCount: loadedEntries.length,
    myCount: myEntries.length,
    deployedCount: deployed.length,
    myAverageConfidence:
      myConfidences.length > 0 ? myConfidences.reduce((a, b) => a + b, 0) / myConfidences.length : null,
  };
}

export type DashboardTab = "mine" | "all" | "deployed";
export type DashboardSort = "newest" | "confidence" | "deployed";

export function filterAndSortEntries(
  entries: DashboardEntry[],
  { tab, search, sort }: { tab: DashboardTab; search: string; sort: DashboardSort }
): DashboardEntry[] {
  // tab === "mine" is handled by the caller passing myEntries directly --
  // this only needs to further filter for "deployed", since "all" and
  // "mine" both take their base entry list as given.
  let filtered = tab === "deployed" ? entries.filter((e) => e.deployedAddress.length > 0) : entries;

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
