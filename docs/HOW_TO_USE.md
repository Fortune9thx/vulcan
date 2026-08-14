# How to Use VULCAN

## Prerequisites

- Node.js 20+ and `pnpm`
- Python 3.12+ (for contract linting/testing)
- A GenLayer-compatible wallet (e.g. MetaMask) with GEN on Bradbury testnet
- A [WalletConnect Cloud](https://cloud.reown.com) project id (free)

## 1. Run the contract tests

```bash
pip install genlayer-test genvm-linter
genvm-lint check contracts/Vulcan.py
gltest tests/direct/test_vulcan.py -v
```

Both are network-independent — `gltest`'s direct mode runs the contract
against an in-process WASI mock, so this works with no wallet, no GEN, and
no live deployment.

## 2. Deploy the contract

```bash
export VULCAN_DEPLOYER_PRIVATE_KEY=0x...   # a funded Bradbury testnet key
node scripts/deploy.mjs bradbury
```

This deploys `contracts/Vulcan.py`, waits for consensus, and writes the
resulting address into `contracts/addresses.json`.

Optionally seed a few example generations so the dashboard isn't empty:

```bash
node scripts/seed.mjs bradbury
```

## 3. Run the frontend

```bash
cd frontend
pnpm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and
# NEXT_PUBLIC_VULCAN_CONTRACT_ADDRESS (from step 2)
pnpm dev
```

Open http://localhost:3000, connect a wallet on Bradbury testnet, and
describe a contract. Forging a contract submits a real transaction, and
runs through two consensus rounds — code generation, then an independent
alignment judgment — so it takes noticeably longer than a single-round
write. Watch the consensus visualizer track the real status for each
round (`PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED →
FINALIZED`, plus appeal/timeout states) rather than a simulated animation.
The result view shows the generated source, the leader's confidence, and
the independently-verified alignment judgment (`yes` / `partial` / `no` +
a stated reason) side by side, along with a "What the validators checked"
panel spelling out every structural rule and what the alignment round
does and doesn't guarantee.

## 4. Deploy a generated contract

From the "Finalize" stage (or a generation's detail drawer on the
dashboard), "Deploy this contract" sends the generated source as a real
GenLayer deploy transaction from your own connected wallet, then records
the resulting address back onto `Vulcan` via `mark_deployed`. This is only
available for generations whose confidence cleared the consensus threshold
(0.55) — `mark_deployed` enforces this on-chain regardless of what the UI
shows.

## 5. Browse the dashboard

`/dashboard` reads live from `Vulcan` — no off-chain database is involved,
so what you see is exactly what's on-chain right now:

- **My Forges** is exact: backed by `get_user_generations`, the on-chain
  personal index, not a scan of whatever happened to be loaded.
- **All Forges / Deployed only** batch 16 at a time newest-first
  (`get_count` + `get_generation` + `get_deployed`), with "Load more"
  fetching further back.
- A search box and sort dropdown work client-side over whatever's
  currently visible in the active tab.
- Click a card to open its full source (copy button, syntax-highlighted),
  its alignment judgment and reason, a "What the validators checked"
  panel, deploy it if it hasn't been already, or **Forge a variant /
  Refine** — pre-fills the main page with the original source embedded in
  a refinement template (truncated if the combined length would exceed
  the contract's 3500-character prompt limit).
- After forging, a toast links straight back to the new entry's detail
  view via `/dashboard?open=<id>`.

Because `Deployed` is computed from the loaded "All Forges" batch (not a
full history scan), it's labeled "of N loaded" and fills in further as
you click "Load more" — `Total generations` and `My generations` are
always exact.

## 6. Share a single generation

Every generation has a public, wallet-free page at `/g/<generation_id>` —
click the share icon in a detail drawer to copy the link. Viewing needs no
wallet (reads use a wallet-free GenLayer client); deploying from that page
still requires connecting one, same as everywhere else.
