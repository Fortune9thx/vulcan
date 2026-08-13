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
                className="rounded-md border border-amber-400/30 px-4 py-2 font-mono text-xs text-amber-100 transition-colors hover:border-amber-400/60 hover:bg-amber-400/5"
              >
                Connect Wallet
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                className="rounded-md border border-danger/40 px-4 py-2 font-mono text-xs text-danger"
              >
                Wrong network
              </button>
            ) : (
              <button
                onClick={openAccountModal}
                className="rounded-md border border-amber-400/20 px-4 py-2 font-mono text-xs text-text-secondary transition-colors hover:border-amber-400/50 hover:text-amber-100"
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
