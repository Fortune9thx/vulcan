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
      // Per GenLayer Portal steward review: deployment must reach
      // FINALIZED, not just ACCEPTED, before this is shown as complete --
      // ACCEPTED can still be appealed/reversed, and "your contract is live
      // at this address" is a stronger claim than generate()'s own polling
      // needs to back (that one deliberately stops at ACCEPTED, verified
      // safe for its read-only purpose -- see genlayer-client.ts).
      const finalTx = await pollConsensusStatus(client, deployHash, ({ status }) => setStatus(status), {
        isCancelled: () => cancelledRef.current,
        requireFinalized: true,
      });

      if (finalTx.statusName !== TransactionStatus.FINALIZED) {
        throw new Error("Deployment did not finalize.");
      }
      const address = finalTx.to_address ?? finalTx.recipient;
      if (!address) {
        throw new Error("Deployment succeeded but no contract address was returned.");
      }

      if (cancelledRef.current) return;
      setState("recording");
      const markHash = await markDeployedOnChain(client, generationId, address);
      // mark_deployed's own transaction was previously fire-and-forget --
      // awaited only for a tx hash, never confirmed to actually reach
      // consensus. The deployment could finalize correctly while this write
      // silently failed or never finalized, and "done" would still show.
      // Now polled to FINALIZED the same way as the deploy transaction
      // itself before this generation is presented as recorded.
      const markTx = await pollConsensusStatus(client, markHash, ({ status }) => setStatus(status), {
        isCancelled: () => cancelledRef.current,
        requireFinalized: true,
      });
      if (markTx.statusName !== TransactionStatus.FINALIZED) {
        throw new Error("Recording the deployment on Vulcan did not finalize.");
      }

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
