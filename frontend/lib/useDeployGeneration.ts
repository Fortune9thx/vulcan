"use client";

import { useEffect, useRef, useState } from "react";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { markDeployedOnChain, pollConsensusStatus } from "./genlayer-client";

export type DeployState = "idle" | "deploying" | "recording" | "done" | "error";

/**
 * Shared deploy-a-generated-contract flow (client.deployContract -> poll ->
 * markDeployedOnChain), used by both the main forge flow (DeployPanel) and
 * the dashboard's detail drawer (GenerationDetail) -- previously
 * implemented twice, independently, in those two components.
 *
 * State resets whenever `generationId` changes. A component that stays
 * mounted across different generations (like a dialog that's shown/hidden
 * rather than unmounted) would otherwise keep a previous generation's
 * "done"/"error" state and render it against an unrelated one.
 */
export function useDeployGeneration(client: GenLayerClient<GenLayerChain> | null, generationId: string) {
  const [state, setState] = useState<DeployState>("idle");
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.PENDING);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setState("idle");
    setStatus(TransactionStatus.PENDING);
    setDeployedAddress(null);
    setError(null);
    return () => {
      cancelledRef.current = true;
    };
  }, [generationId]);

  async function deploy(source: string) {
    if (!client) return;
    setState("deploying");
    setError(null);
    try {
      const deployHash = await client.deployContract({ code: source });
      const finalTx = await pollConsensusStatus(client, deployHash, ({ status }) => setStatus(status), {
        isCancelled: () => cancelledRef.current,
      });

      if (
        finalTx.statusName !== TransactionStatus.FINALIZED &&
        finalTx.statusName !== TransactionStatus.ACCEPTED
      ) {
        throw new Error("Deployment did not reach consensus.");
      }
      const address = finalTx.to_address ?? finalTx.recipient;
      if (!address) {
        throw new Error("Deployment succeeded but no contract address was returned.");
      }

      if (cancelledRef.current) return;
      setState("recording");
      await markDeployedOnChain(client, generationId, address);

      if (cancelledRef.current) return;
      setDeployedAddress(address);
      setState("done");
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Deployment failed.");
      setState("error");
    }
  }

  return { state, status, deployedAddress, error, deploy };
}
