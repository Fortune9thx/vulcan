# VULCAN

**Describe it. Forge it. Deploy it under consensus.**

VULCAN is a GenLayer Intelligent Contract that generates other Intelligent
Contracts from a natural-language description — under real multi-validator
LLM consensus, not a single off-chain model call. A cinematic Next.js
frontend drives and visualizes the full transaction lifecycle, from
submission through consensus to a real on-chain deployment.

## The problem

Anyone can ask an LLM to write a smart contract. Nobody can trust the
result on its own — a single off-chain model call has no accountability.
VULCAN makes the generation step itself a GenLayer consensus decision: a
leader proposes a contract, every validator in the round independently
re-checks it against the same objective rules (legal storage types,
required decorators, a minimum confidence threshold), and only an
agreed-upon result is ever stored.

## How it works

1. **Describe** the contract you want in plain language.
2. **Forge** — VULCAN's `generate()` method calls `gl.vm.run_nondet_unsafe`
   with a leader that asks an LLM for structured JSON (`source`, `summary`,
   `confidence`) and a validator that every consensus participant runs
   independently against the same structural/confidence gate.
3. **Watch consensus** — the frontend polls the real transaction status
   (`PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED`)
   and animates it live. Nothing here is a fake timer.
4. **Review** the generated source, syntax-highlighted, alongside the
   original prompt and the confidence the consensus round agreed on.
5. **Deploy** — your own connected wallet deploys the generated contract
   directly to GenLayer, and VULCAN records the result via `mark_deployed`.
6. **Browse the dashboard** — every generation ever forged, read live from
   the contract (no off-chain database): filter to your own forges or
   everyone's, search, sort, open full source in a detail drawer, deploy
   straight from there, or forge a variant of an existing prompt.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full consensus
design (including two platform corrections made after checking the
original design against previously live-tested GenLayer behavior) and
[`docs/HOW_TO_USE.md`](docs/HOW_TO_USE.md) to run it yourself.

## Structure

```
contracts/       Vulcan.py -- the Intelligent Contract
tests/direct/     gltest direct-mode unit tests (network-independent)
tests/integration/ Real-network end-to-end tests
frontend/         Next.js 15 app -- the cinematic forge UI
scripts/          deploy.mjs / seed.mjs
docs/             ARCHITECTURE, SUBMISSION, HOW_TO_USE
```

## Stack

Contract: Python 3.12+ on GenVM, pinned to
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
Frontend: Next.js 15, TypeScript, Tailwind CSS v4, Framer Motion,
`genlayer-js`, wagmi + viem + RainbowKit, shiki.
