# VULCAN

**Describe it. Forge it. Deploy it under consensus.**

**Live:** [vulcan-x9.vercel.app](https://vulcan-x9.vercel.app) · **Contract:**
[`0xA7bE484beE1Ee5A83ffDFa370f2803F52605369F`](https://explorer-bradbury.genlayer.com/address/0xA7bE484beE1Ee5A83ffDFa370f2803F52605369F)
on GenLayer Bradbury

VULCAN is a GenLayer Intelligent Contract that generates other Intelligent
Contracts from a natural-language description — under real multi-validator
LLM consensus, not a single off-chain model call. A polished, editorial
Next.js frontend drives and visualizes the full transaction lifecycle, from
submission through consensus to a real on-chain deployment.

## The problem

Anyone can ask an LLM to write a smart contract. Nobody can trust the
result on its own — a single off-chain model call has no accountability.
VULCAN makes the generation step itself two GenLayer consensus decisions:
a leader proposes a contract and every validator independently re-checks
it against the same objective structural rules, then a second, separate
consensus round independently judges whether the agreed source actually
attempts what was asked — and only an agreed-upon result is ever stored.

## How it works

1. **Describe** the contract you want in plain language.
2. **Forge** — VULCAN's `generate()` runs two consensus rounds:
   `gl.vm.run_nondet_unsafe` for code generation (a leader proposes
   `source`/`summary`/`confidence`, every validator re-runs the same
   AST-based structural check), then `gl.eq_principle.prompt_non_comparative`
   for an independent alignment judgment (`yes`/`partial`/`no` + a reason)
   on the already-agreed source.
3. **Watch consensus** — the frontend polls the real transaction status
   across both rounds (`PENDING → PROPOSING → COMMITTING → REVEALING →
   ACCEPTED → FINALIZED`, plus appeal/timeout states) and animates it
   live. Nothing here is a fake timer.
4. **Review** the generated source, syntax-highlighted, alongside the
   original prompt, the confidence the first round agreed on, the
   independently-verified alignment judgment, and a transparency panel
   spelling out exactly what was checked.
5. **Deploy** — your own connected wallet deploys the generated contract
   directly to GenLayer, and VULCAN records the result via `mark_deployed`.
6. **Browse the dashboard** — every generation ever forged, read live from
   the contract (no off-chain database). "My Forges" is exact, backed by
   an on-chain personal index; filter, search, sort, open full source in a
   detail drawer, deploy straight from there, refine a variant, or share a
   single generation via its public `/g/[id]` page.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full two-round
consensus design (including platform corrections made after checking the
original design against previously live-tested GenLayer behavior, an
independent audit that found and fixed 13 real bugs, a full security audit,
and a round of fixes found through actually using the live deployment —
not just testing) and [`docs/HOW_TO_USE.md`](docs/HOW_TO_USE.md) to run it
yourself.

## Structure

```
contracts/       Vulcan.py -- the Intelligent Contract
tests/direct/     gltest direct-mode unit tests (network-independent)
tests/integration/ Real-network end-to-end tests
frontend/         Next.js 15 app -- the editorial forge UI
scripts/          deploy.mjs / seed.mjs
docs/             ARCHITECTURE, SUBMISSION, HOW_TO_USE
.github/workflows/ CI: contract lint+test, frontend lint+build
```

## Stack

Contract: Python 3.12+ on GenVM, pinned to
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
Frontend: Next.js 15, TypeScript, Tailwind CSS v4, Framer Motion,
`genlayer-js`, wagmi + viem + RainbowKit, shiki.
