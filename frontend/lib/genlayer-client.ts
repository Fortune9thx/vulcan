"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerClient, GenLayerChain, GenLayerTransaction, TransactionHash } from "genlayer-js/types";
import {
  VULCAN_METHODS,
  getVulcanAddress,
  type GenerationRecord,
  parseGenerationRecord,
  parseGenerationIdList,
} from "./vulcan-abi";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

let _readOnlyClient: GenLayerClient<GenLayerChain> | null = null;

/**
 * A wallet-free client for read-only pages (the public /g/[id] share
 * page) -- confirmed working: createClient({chain}) with no account/
 * provider successfully executes readContract calls, since Vulcan's view
 * methods need no signer at all. Never use this for writes.
 */
export function getReadOnlyVulcanClient(): GenLayerClient<GenLayerChain> {
  if (!_readOnlyClient) {
    _readOnlyClient = createClient({ chain: testnetBradbury });
  }
  return _readOnlyClient;
}

export function useVulcanClient(): {
  client: GenLayerClient<GenLayerChain> | null;
  address: `0x${string}` | undefined;
} {
  const { address, isConnected } = useAccount();

  const client = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined" || !window.ethereum) {
      return null;
    }
    return createClient({
      chain: testnetBradbury,
      account: address,
      provider: window.ethereum,
    });
  }, [isConnected, address]);

  return { client, address };
}

export async function generateContract(
  client: GenLayerClient<GenLayerChain>,
  prompt: string
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.generate,
    args: [prompt],
    value: 0n,
  });
  return hash as `0x${string}`;
}

export async function markDeployedOnChain(
  client: GenLayerClient<GenLayerChain>,
  generationId: string,
  deployedAddress: string
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.markDeployed,
    args: [generationId, deployedAddress],
    value: 0n,
  });
  return hash as `0x${string}`;
}

export async function fetchGeneration(
  client: GenLayerClient<GenLayerChain>,
  generationId: string
): Promise<GenerationRecord | null> {
  const raw = await client.readContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.getGeneration,
    args: [generationId],
  });
  return parseGenerationRecord(String(raw));
}

const ID_RESOLUTION_SEARCH_WINDOW = 10;

/**
 * generation_id is assigned inside the contract's own execution
 * (generation_count at the moment THIS transaction runs), not at
 * submission time -- reading get_count() before submitting and assuming
 * that value is the id is only safe if no other generate() call executes
 * in between. If one does, the naive guess silently points at a different
 * (possibly another user's) generation.
 *
 * This resolves the real id defensively: try the guess first (the fast,
 * overwhelmingly common path), and if that record doesn't actually match
 * this prompt/sender, search backward from the current count for the one
 * that does, bounded to a small window rather than scanning the whole
 * history.
 */
export async function resolveGenerationId(
  client: GenLayerClient<GenLayerChain>,
  {
    guessedId,
    prompt,
    senderAddress,
  }: { guessedId: string; prompt: string; senderAddress: string }
): Promise<string> {
  const matches = (record: GenerationRecord | null) =>
    !!record && record.prompt === prompt && record.sender.toLowerCase() === senderAddress.toLowerCase();

  const guessed = await fetchGeneration(client, guessedId);
  if (matches(guessed)) return guessedId;

  const count = await fetchGenerationCount(client);
  const searchStart = count - 1;
  const searchEnd = Math.max(-1, searchStart - ID_RESOLUTION_SEARCH_WINDOW);

  for (let id = searchStart; id > searchEnd; id--) {
    const candidateId = String(id);
    if (candidateId === guessedId) continue; // already checked above
    const candidate = await fetchGeneration(client, candidateId);
    if (matches(candidate)) return candidateId;
  }

  console.warn(
    `Could not confidently resolve the generation id for this submission within ` +
      `${ID_RESOLUTION_SEARCH_WINDOW} entries of the current count -- falling back to the ` +
      `pre-submission guess (${guessedId}), which may be wrong if other generations landed concurrently.`
  );
  return guessedId;
}

export async function fetchGenerationCount(client: GenLayerClient<GenLayerChain>): Promise<number> {
  const count = await client.readContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.getCount,
    args: [],
  });
  return Number(count);
}

/**
 * The on-chain personal index (Vulcan.user_generations) -- returns this
 * user's generation ids directly, newest last, with no scanning at all.
 * Used to make "My Forges" exact rather than limited to whatever batch
 * happens to be loaded (see fetchGenerationsWindow's fallback path in
 * dashboard-data.ts for users who forged before this index existed).
 */
export async function fetchUserGenerationIds(
  client: GenLayerClient<GenLayerChain>,
  userAddress: string
): Promise<string[]> {
  const raw = await client.readContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.getUserGenerations,
    args: [userAddress],
  });
  return parseGenerationIdList(String(raw));
}

export async function fetchDeployedAddress(
  client: GenLayerClient<GenLayerChain>,
  generationId: string
): Promise<string> {
  const deployed = await client.readContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.getDeployed,
    args: [generationId],
  });
  return String(deployed ?? "");
}

/** Terminal statuses after which polling should stop. */
const TERMINAL_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
]);

export interface ConsensusTick {
  status: TransactionStatus;
  transaction: GenLayerTransaction;
}

const MAX_CONSECUTIVE_RPC_FAILURES = 4;

export class PollCancelledError extends Error {
  constructor() {
    super("Polling was cancelled");
    this.name = "PollCancelledError";
  }
}

/**
 * Polls the real transaction status until a terminal state is reached,
 * invoking onTick with every observed status change. This drives
 * ConsensusVisualizer directly off chain state -- no fabricated timers.
 *
 * `isCancelled` is checked before every network call and every sleep, not
 * just inside onTick -- without it, a caller's "cancelled" flag only
 * stopped the loop from *reporting* status, not from actually running: the
 * for-loop kept calling getTransaction and sleeping for up to
 * intervalMs * maxAttempts after the UI it was updating had already
 * unmounted. A single transient RPC failure (client.getTransaction
 * throwing on a network blip) also used to abort the whole poll
 * immediately; it's now tolerated up to MAX_CONSECUTIVE_RPC_FAILURES times
 * in a row before giving up, since one bad request doesn't mean the
 * transaction itself failed.
 */
export async function pollConsensusStatus(
  client: GenLayerClient<GenLayerChain>,
  hash: `0x${string}`,
  onTick: (tick: ConsensusTick) => void,
  {
    intervalMs = 1500,
    maxAttempts = 120,
    isCancelled = () => false,
  }: { intervalMs?: number; maxAttempts?: number; isCancelled?: () => boolean } = {}
): Promise<GenLayerTransaction> {
  let lastStatus: TransactionStatus | null = null;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) throw new PollCancelledError();

    let transaction: GenLayerTransaction;
    try {
      transaction = await client.getTransaction({ hash: hash as TransactionHash });
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures > MAX_CONSECUTIVE_RPC_FAILURES) throw err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    const status = transaction.statusName ?? TransactionStatus.PENDING;

    if (status !== lastStatus) {
      onTick({ status, transaction });
      lastStatus = status;
    }

    if (TERMINAL_STATUSES.has(status)) {
      return transaction;
    }

    if (isCancelled()) throw new PollCancelledError();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for transaction to reach a terminal status");
}
