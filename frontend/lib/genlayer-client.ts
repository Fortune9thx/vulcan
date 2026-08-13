"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerClient, GenLayerChain, GenLayerTransaction, TransactionHash } from "genlayer-js/types";
import { VULCAN_METHODS, getVulcanAddress, type GenerationRecord, parseGenerationRecord } from "./vulcan-abi";

declare global {
  interface Window {
    ethereum?: unknown;
  }
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

export async function fetchGenerationCount(client: GenLayerClient<GenLayerChain>): Promise<number> {
  const count = await client.readContract({
    address: getVulcanAddress(),
    functionName: VULCAN_METHODS.getCount,
    args: [],
  });
  return Number(count);
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

/**
 * Polls the real transaction status until a terminal state is reached,
 * invoking onTick with every observed status change. This drives
 * ConsensusVisualizer directly off chain state -- no fabricated timers.
 */
export async function pollConsensusStatus(
  client: GenLayerClient<GenLayerChain>,
  hash: `0x${string}`,
  onTick: (tick: ConsensusTick) => void,
  { intervalMs = 1500, maxAttempts = 120 }: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<GenLayerTransaction> {
  let lastStatus: TransactionStatus | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const transaction = await client.getTransaction({ hash: hash as TransactionHash });
    const status = transaction.statusName ?? TransactionStatus.PENDING;

    if (status !== lastStatus) {
      onTick({ status, transaction });
      lastStatus = status;
    }

    if (TERMINAL_STATUSES.has(status)) {
      return transaction;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for transaction to reach a terminal status");
}
