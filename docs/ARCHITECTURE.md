# VULCAN Architecture

## Overview

VULCAN turns a natural-language description into a full GenLayer Intelligent
Contract, generated under real multi-validator consensus rather than a
single off-chain model call. The `Vulcan` contract (`contracts/Vulcan.py`)
owns the entire generation lifecycle: it prompts an LLM through GenLayer's
non-deterministic execution primitive, gates the result through a
validator function that every consensus participant runs independently,
and stores only outputs that clear that gate. The frontend does not
perform any AI work itself — it submits a transaction, watches the real
transaction status progress through consensus, and reads back whatever the
contract actually stored.

## Consensus flow

`generate(prompt)` calls `gl.vm.run_nondet_unsafe(leader, validator)`:

- `leader()` calls `gl.nondet.exec_prompt(system_prompt, response_format="json")`,
  asking the model for `{source, summary, confidence}` as JSON.
- `validator(leaders_res)` receives the leader's result wrapped as
  `gl.vm.Return` and independently checks it against
  `is_valid_generation`: the reported confidence must parse as a float
  `>= 0.55`, the source must contain the required GenLayer scaffolding
  (`from genlayer import *`, a `gl.Contract` base, at least one
  `@gl.public.*` decorator, the pinned runner dependency string), and must
  not contain bare `list[`/`dict[` storage types. Every validator in the
  round runs this same deterministic check against the same leader output —
  it doesn't re-generate its own answer and diff it against the leader's,
  which would fail non-deterministically for creative code generation
  (two independently generated implementations of the same request are
  rarely byte-identical, so a regenerate-and-compare validator would reject
  good output almost as often as bad output). Structural/confidence
  validation is deterministic given the same leader output, so every
  honest validator reaches the same verdict — which is what GenLayer's
  consensus actually needs.
- Only if enough validators agree does the write succeed and the record get
  stored in `generations: TreeMap[str, str]` as a JSON string.

On the frontend, this maps directly onto GenLayer's real, documented
transaction lifecycle (`genlayer-js/types`'s `TransactionStatus` enum):
`PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED`, with
`UNDETERMINED`/`CANCELED` as off-path outcomes. `ConsensusVisualizer`
polls the real transaction via `client.getTransaction({ hash })` and
animates its 5-node pentagon directly off these values — `PROPOSING`
highlights the leader node, `COMMITTING` pulses the four validator nodes,
`REVEALING` draws the connecting lines, `ACCEPTED` triggers the consensus
burst. There is no fabricated timer standing in for consensus, and no
invented per-validator reasoning text: the GenLayer client API doesn't
expose individual validator votes, so `ValidatorCards` shows the one real
thing that exists — the stored generation record — rather than inventing
five different opinions.

## Platform corrections

Two changes were made to the original contract design after checking it
against live-tested GenLayer platform behavior (not just the spec as
given). Both are the result of prior hands-on pilot testing on the
Bradbury testnet across other projects, re-verified against current
GenLayer documentation before being applied here.

**1. `deployed` is `TreeMap[str, str]`, not `TreeMap[str, Address]`.**
Every non-`str` TreeMap value type tested on Bradbury — a `@dataclass`
value, a plain `u256` value, a plain `bool` value — deploys cleanly
(the transaction reaches `ACCEPTED`) but the contract becomes permanently
unreadable afterward: every subsequent read returns "contract not found"
indefinitely, with no error at deploy time to catch it. A control contract
using `TreeMap[str, str]` read back successfully on the first attempt,
every time. `Address` was never independently pilot-tested, but there's no
evidence it's exempt from the same bug, and it introduces a second
uncertainty on top of that: an `Address.zero()` "not deployed" sentinel,
which could not be confirmed to exist in the current SDK. Storing the
deployed address as a plain hex string (empty string = not yet deployed)
sidesteps both risks with a pattern that's independently verified reliable.

**2. The LLM is explicitly instructed to return `confidence` as a quoted
string, never a bare JSON number.** GenVM's calldata wire format has no
float type. `gl.nondet.exec_prompt(..., response_format="json")` auto-parses
the model's JSON response into a Python dict *before* returning control to
the contract, and that parse step crosses the same calldata boundary that
rejects floats — so a bare `0.85` in the model's own output would crash
inside `leader()` on every single call, before any contract validation
logic ever runs. The system prompt spells this constraint out explicitly
(`"confidence" MUST be a quoted JSON string like "0.85", never a bare JSON
number like 0.85 -- a bare number crashes the caller`), and both `validator`
and `mark_deployed` parse it with `float()` on the contract side rather
than trusting its shape.

## Deploy is pull-based, not inline

`generate()` never deploys the contract it produces, and never calls
another contract's write method. GenLayer's cross-contract write calls
(`.emit(...)`) are known to silently no-op on Bradbury — the calling
transaction reaches `ACCEPTED` with no error, but the target contract's
state never actually changes. Rather than depend on that path, VULCAN
splits deployment into two explicit, independently-verifiable steps: the
connected user's own wallet deploys the generated source directly via
`client.deployContract({ code })` (a real GenLayer deploy transaction, not
a contract-to-contract call), and once that succeeds the frontend calls
`Vulcan.mark_deployed(generation_id, address)` — a plain write against
`Vulcan` itself — to record the result. `mark_deployed` re-checks the
stored confidence against the same threshold before accepting the address,
so it can't be used to mark a low-confidence generation as deployed even
if the frontend's own guard were bypassed.

## Dashboard: on-chain-only, batched

`/dashboard` (`frontend/app/dashboard/DashboardClient.tsx`) is a read
surface over the exact same three view methods the forge flow already
uses (`get_count`, `get_generation`, `get_deployed`) — there is no
off-chain database or indexer behind it, deliberately. Generation ids are
sequential and assigned in `generate()` itself, so the dashboard can walk
backwards from `get_count() - 1` without needing an index: `lib/dashboard-
data.ts`'s `nextIdWindow` computes a batch of ids, `fetchGenerationsWindow`
resolves them with `Promise.all`, and "Load more" just extends the window
further back. The top stats bar (`My generations`, `Deployed`, `My avg.
confidence`) is computed from whatever's currently loaded, not a full scan
of every generation ever made — only `Total generations` (a single
`get_count()` call) is a true global figure. Scanning the entire history
up front to make the other three exact would defeat the point of batched
loading, so they're labeled "of N loaded" and grow more accurate as more
batches load. This is a deliberate scoping choice, not an oversight.

The "Forge a variant" link and the post-generate "View in Dashboard" toast
both use a plain query param (`/?prompt=...`, `/dashboard?open=<id>`)
rather than any client-side store — consistent with keeping all real state
on-chain and treating the URL as the only piece of client state worth
persisting.

## Contract addresses

VULCAN has been deployed twice on Bradbury as the generation prompt was
strengthened (contracts are immutable once deployed, so a prompt change
requires a fresh instance, not an upgrade):

- `0x135E3Fe73A0Eab53727E598459BceB22ec5BF57D` — original prompt, superseded.
- `0xf50543E8e15f4e09E7aF9D143549F165FA86F40d` — strengthened prompt
  (idiomatic storage-declaration guidance, an explicit non-determinism-
  boundary rule, and a minimal reference example), superseded.
- `0x19b04aa76f241db4B645fCF5d332513a6D18f5A4` — current, after the
  independent-audit fixes below (AST-based structural validation, a
  str-only TreeMap rule, `mark_deployed` access control).

All three are recorded in `contracts/addresses.json`; the frontend only
ever talks to the current one via `NEXT_PUBLIC_VULCAN_CONTRACT_ADDRESS`.

## Independent audit findings and fixes

Before submission, six independent zero-bias reviews (contract
correctness, on-chain data/transaction layer, UI flow/duplication, test
coverage, docs accuracy, Portal quality-bar skepticism) were run
specifically to find reasons to reject the project, not to confirm it
works. All 13 confirmed findings were fixed, each backed by a new or
updated test that would fail without the fix.

**Contract-side, most severe first:**
- The original validator used raw substring matching (`fragment in
  source`) to check for required GenLayer scaffolding. This is bypassable
  — an LLM steered by a crafted prompt could satisfy every required
  fragment by embedding them in a comment, with no real functioning code
  around them, and every validator would deterministically "validate" the
  result. Replaced with real `ast`-based structural checks: an actual
  `ast.ImportFrom` for `genlayer`, an actual `ast.ClassDef` with a base
  matching `gl.Contract`, an actual `@gl.public.*`-decorated method inside
  it. This also fixed a false-positive: the old `"list[" in source` /
  `"dict[" in source` check rejected any code merely naming a variable
  `my_list`, since it wasn't annotation-aware; the AST check only inspects
  real class-level storage annotations.
- `float("nan") < 0.55` is `False` in Python — the confidence gate didn't
  reject NaN/Infinity confidence values because nothing checked
  `math.isfinite()` explicitly. Fixed.
- Confirmed empirically (not theorized) via a minimal probe contract: when
  the LLM's own JSON response contains a bare float, `gl.vm.run_nondet_
  unsafe` resolves to `None` rather than raising a Python exception inside
  `leader()` — a `try/except` around `exec_prompt` cannot catch it, because
  the failure happens in GenVM's own calldata encoding, not in contract
  code. `generate()` previously had no null-check before calling
  `result.get(...)`, so this crashed with an unhandled `AttributeError`.
  Fixed with an explicit `if result is None: raise gl.vm.UserError(...)`.
- The system prompt told the model any concrete `TreeMap[K,V]` was legal,
  contradicting this project's own documented finding two sections up —
  Vulcan could generate a contract that bricks itself the moment it's
  deployed, for an entirely ordinary request. The validator now rejects
  any `TreeMap` value type other than `str` at generation time, not just
  in prompt guidance.
- `mark_deployed` had no access control at all: any caller could mark any
  generation as deployed with any string as the address, overwrite an
  existing legitimate record, or write `""` to silently un-mark someone
  else's real deployment. Now requires the caller to match the
  generation's original `sender`, rejects a second call on an
  already-deployed generation, and validates the address is a well-formed
  20-byte hex string.

**Frontend-side:**
- `generation_id` is assigned inside the contract's own execution, not at
  submission time. The frontend guessed it from a `get_count()` read taken
  *before* submitting, which is wrong if another `generate()` call lands
  in between — silently attributing another user's generation, and
  potentially writing a deployed address onto their record. Now resolved
  defensively after consensus: try the guess first, and if it doesn't
  match this prompt/sender, search backward from the current count for
  the record that does.
- `pollConsensusStatus`'s cancellation flag only gated its `onTick`
  callback, not the polling loop itself — a component that unmounted
  mid-consensus left the loop running for up to three minutes. It also
  aborted entirely on a single transient RPC failure. Both fixed: the loop
  now checks cancellation before every network call and sleep, and
  tolerates a few consecutive failures before giving up.
- `DeployPanel` and `GenerationDetail` had copy-pasted, independently
  maintained deploy flows. Extracted into a shared `useDeployGeneration`
  hook, which also fixed a real bug: `GenerationDetail` stayed mounted
  across different generations (Radix only toggles visibility), so a
  previous generation's "done" state leaked onto an unrelated,
  never-deployed one. The hook resets on `generationId` change.
- `ConsensusVisualizer` only handled 9 of the real 14 `TransactionStatus`
  values — a transaction reaching `READY_TO_FINALIZE` or a timeout state
  looked identical to "nothing has started," and timeouts rendered in the
  neutral style instead of the failure style. All 14 now handled
  explicitly.
- UI copy said validators "independently check" the result. The validator
  is a deterministic function of the leader's single output, replicated
  across validators — a split vote is impossible by construction, so
  "independently" overstated it. Reworded to describe what actually
  happens: every validator re-runs the same objective check.
