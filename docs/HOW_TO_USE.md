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
describe a contract. Forging a contract submits a real transaction —
watch the consensus visualizer track its actual status
(`PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED`)
rather than a simulated animation.

## 4. Deploy a generated contract

From the "Finalize" stage (or a generation's detail drawer on the
dashboard), "Deploy this contract" sends the generated source as a real
GenLayer deploy transaction from your own connected wallet, then records
the resulting address back onto `Vulcan` via `mark_deployed`. This is only
available for generations whose confidence cleared the consensus threshold
(0.55) — `mark_deployed` enforces this on-chain regardless of what the UI
shows.

## 5. Browse the dashboard

`/dashboard` reads live from `Vulcan` — `get_count`, `get_generation`, and
`get_deployed`, batched 16 at a time, newest first ("Load more" fetches
further back). No off-chain database is involved, so what you see is
exactly what's on-chain right now:

- **My Forges / All Forges / Deployed only** tabs, a search box, and a sort
  dropdown, all client-side over whatever's currently loaded.
- Click a card to open its full source (copy button, syntax-highlighted),
  deploy it if it hasn't been already, or **Forge a variant** — a deep link
  back to the main page with the original prompt pre-filled.
- After forging, a toast links straight back to the new entry's detail
  view via `/dashboard?open=<id>`.

Because `My generations` / `Deployed` / `My avg. confidence` are computed
from the loaded batch (not a full history scan), they're labeled "of N
loaded" and fill in further as you click "Load more" — only `Total
generations` is always exact.
