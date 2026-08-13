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

Optionally seed a few example generations so `/history` isn't empty:

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

From the "Finalize" stage, "Deploy this contract" sends the generated
source as a real GenLayer deploy transaction from your own connected
wallet, then records the resulting address back onto `Vulcan` via
`mark_deployed`. This is only available for generations whose confidence
cleared the consensus threshold (0.55) — `mark_deployed` enforces this
on-chain regardless of what the UI shows.
