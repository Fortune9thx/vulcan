"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletConnect() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                className="rounded-full bg-text-primary px-5 py-2.5 text-sm font-medium text-void-raised transition-colors hover:bg-black"
              >
                Connect Wallet
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                className="rounded-full border border-danger/40 px-5 py-2.5 text-sm font-medium text-danger"
              >
                Wrong network
              </button>
            ) : (
              <button
                onClick={openAccountModal}
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-text-secondary"
              >
                {account.displayName}
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
