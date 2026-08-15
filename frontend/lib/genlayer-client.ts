"use client";

import { useEffect, useState } from "react";
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
  const { address, isConnected, connector } = useAccount();
  const [client, setClient] = useState<GenLayerClient<GenLayerChain> | null>(null);

  // Reading window.ethereum directly assumed the connected wallet is always
  // the one injected provider a page happens to see -- true only for a
  // single browser-extension wallet. Any other connector (WalletConnect,
  // Coinbase Smart Wallet, Safe, or even a second installed extension
  // shadowing window.ethereum) leaves wagmi's own useAccount() correctly
  // reporting isConnected/address while this stayed null forever, so the
  // UI showed "Connect your wallet" even with a wallet genuinely connected.
  // connector.getProvider() returns whichever EIP-1193 provider wagmi
  // actually established the connection through, matching every connector
  // type instead of guessing at the global.
  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !address || !connector) {
      setClient(null);
      return;
    }
    connector
      .getProvider()
      .then((provider) => {
        if (cancelled) return;
        setClient(
          createClient({
            chain: testnetBradbury,
            account: address,
            // wagmi's connector.getProvider() is typed as Promise<unknown> --
            // it's a real EIP-1193 provider at runtime for every connector
            // type, exactly the shape genlayer-js's createClient expects here.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider: provider as any,
          })
        );
      })
      .catch(() => {
        if (!cancelled) setClient(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, connector]);

  return { client, address };
}

// Every chain genlayer-js ships (localnet, studionet, both testnets) defaults
// consensusMaxRotations to 3 -- confirmed by reading the installed SDK
// source, not assumed. That's the number of leader attempts the platform
// makes before giving up and reporting LEADER_TIMEOUT for the whole
// transaction. generate() is a heavier call than most writes it takes:
// a large system prompt asking for a full contract, then (on top of that)
// a second independent LLM round for alignment -- more surface for one
// slow/failed attempt to eat the default budget. Raised to 5 specifically
// for this call; other Vulcan writes (mark_deployed) stay on the default
// since they're plain deterministic writes with no LLM call in them at all.
const GENERATE_MAX_ROTATIONS = 5;

export async function generateContract(
  client: GenLayerClient<GenLayerChain>,
  prompt: string
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.generate,
    args: [prompt],
    value: 0n,
    consensusMaxRotations: GENERATE_MAX_ROTATIONS,
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

/**
 * Terminal statuses after which polling should stop -- matches
 * genlayer-js's own DECIDED_STATES classification in full, including
 * ACCEPTED. An earlier version deliberately excluded ACCEPTED here,
 * reasoning it could still be appealed/reversed before FINALIZED and that
 * stopping there hadn't been verified safe against a read racing
 * finalization -- a real, live user report ("stuck after Consensus
 * reached, nothing shows") forced actually checking that assumption
 * instead of leaving it as an unverified caveat. Confirmed empirically:
 * submitted a real generate() call, and get_generation() correctly
 * returned the full record via the same genlayer-js readContract path the
 * frontend uses, well before the transaction ever reached FINALIZED --
 * which itself was observed taking several minutes past ACCEPTED on
 * Bradbury (also confirmed directly, via a separate contract deploy this
 * session). Waiting for FINALIZED wasn't a safety margin here, it was the
 * entire cause of the stuck screen: FINALIZED settles the appeal window,
 * it doesn't gate whether the write is readable. VALIDATORS_TIMEOUT and
 * LEADER_TIMEOUT are real terminal outcomes the SDK itself already
 * classifies as decided -- omitting them here isn't a smaller polling
 * window, it's the caller grinding through the full maxAttempts budget
 * waiting for a status change that will never come, then surfacing a
 * generic "timed out waiting" error instead of the real, specific,
 * already-available reason.
 */
const TERMINAL_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.ACCEPTED,
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.VALIDATORS_TIMEOUT,
  TransactionStatus.LEADER_TIMEOUT,
]);

/**
 * Used when a caller needs the stronger guarantee -- deployment and
 * mark_deployed specifically, per GenLayer Portal steward review: showing
 * "deployed successfully" the moment ACCEPTED is reached (reused from
 * generate()'s polling, where it's correct -- see TERMINAL_STATUSES above)
 * understates deployment's real claim. A generation record being readable
 * at ACCEPTED is a read-only fact; "this contract is live and permanent"
 * is a stronger claim that deserves waiting past the appeal window ACCEPTED
 * can still be reversed within. Excludes ACCEPTED on purpose -- everything
 * else is identical.
 */
const FINALIZED_REQUIRED_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.VALIDATORS_TIMEOUT,
  TransactionStatus.LEADER_TIMEOUT,
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
    intervalMs,
    maxAttempts,
    isCancelled = () => false,
    requireFinalized = false,
  }: {
    intervalMs?: number;
    maxAttempts?: number;
    isCancelled?: () => boolean;
    /**
     * Wait past ACCEPTED for FINALIZED specifically, per GenLayer Portal
     * steward review -- see FINALIZED_REQUIRED_STATUSES above. FINALIZED
     * was observed taking several minutes past ACCEPTED on Bradbury this
     * session, so this also widens the default poll budget to match (the
     * same ~100 attempts / 5s the GenLayer CLI's own `receipt` command
     * defaults to for the identical wait) rather than reusing the ~3-minute
     * budget tuned for the ACCEPTED case, which would otherwise trade the
     * steward's requested correctness fix for a new, spurious timeout.
     */
    requireFinalized?: boolean;
  } = {}
): Promise<GenLayerTransaction> {
  const terminalStatuses = requireFinalized ? FINALIZED_REQUIRED_STATUSES : TERMINAL_STATUSES;
  const effectiveIntervalMs = intervalMs ?? (requireFinalized ? 5000 : 1500);
  const effectiveMaxAttempts = maxAttempts ?? (requireFinalized ? 100 : 120);
  let lastStatus: TransactionStatus | null = null;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < effectiveMaxAttempts; attempt++) {
    if (isCancelled()) throw new PollCancelledError();

    let transaction: GenLayerTransaction;
    try {
      transaction = await client.getTransaction({ hash: hash as TransactionHash });
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures > MAX_CONSECUTIVE_RPC_FAILURES) throw err;
      await new Promise((resolve) => setTimeout(resolve, effectiveIntervalMs));
      continue;
    }

    const status = transaction.statusName ?? TransactionStatus.PENDING;

    if (status !== lastStatus) {
      onTick({ status, transaction });
      lastStatus = status;
    }

    if (terminalStatuses.has(status)) {
      return transaction;
    }

    if (isCancelled()) throw new PollCancelledError();
    await new Promise((resolve) => setTimeout(resolve, effectiveIntervalMs));
  }

  throw new Error(
    requireFinalized
      ? "Timed out waiting for the transaction to finalize."
      : "Timed out waiting for transaction to reach a terminal status"
  );
}
