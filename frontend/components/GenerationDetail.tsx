"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Share2, X } from "lucide-react";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { GenerationDetailContent } from "@/components/GenerationDetailContent";
import type { DashboardEntry } from "@/lib/dashboard-data";
import { truncateAddress } from "@/lib/utils";

export function GenerationDetail({
  entry,
  open,
  onOpenChange,
  client,
  onDeployed,
}: {
  entry: DashboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: GenLayerClient<GenLayerChain> | null;
  onDeployed: (generationId: string, address: string) => void;
}) {
  const [shared, setShared] = useState(false);

  if (!entry) return null;

  async function handleShare() {
    const url = `${window.location.origin}/g/${entry!.id}`;
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1600);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-void-raised p-6 shadow-xl focus:outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-2xl italic text-text-primary">
                Generation #{entry.id}
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-xs text-text-muted">
                {truncateAddress(entry.sender, 6)}
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleShare}
                title="Copy public share link"
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary"
              >
                {shared ? <Check size={16} /> : <Share2 size={16} />}
              </button>
              <Dialog.Close asChild>
                <button className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="mt-6">
            <GenerationDetailContent entry={entry} client={client} onDeployed={onDeployed} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
