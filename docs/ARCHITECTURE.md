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

## Consensus flow: two independent rounds

`generate(prompt)` runs two separate non-deterministic consensus rounds,
sequentially, each using the GenLayer primitive actually built for its job.

**Round 1 — code generation (`gl.vm.run_nondet_unsafe(leader, validator)`).**
- `leader()` calls `gl.nondet.exec_prompt(system_prompt, response_format="json")`,
  asking the model for `{source, summary, confidence}` as JSON.
- `validator(leaders_res)` receives the leader's result wrapped as
  `gl.vm.Return` and checks it against `is_valid_generation`: the reported
  confidence must parse as a *finite* float `>= 0.55` (`math.isfinite` --
  `float("nan") < 0.55` is `False` in Python, so NaN/Infinity need an
  explicit check or they'd sail through), the source must start with the
  exact pinned header, parse as valid Python (`ast.parse`), contain a real
  `from genlayer import *`, a real class inheriting `gl.Contract`, at
  least one method with a real `@gl.public.*` decorator, and no class-level
  storage annotation using bare `list`/`dict` or a `TreeMap` value type
  other than `str`. This is real AST inspection, not a text scan --
  earlier versions of this check used substring matching, which a crafted
  prompt could defeat by burying the required fragments in a comment with
  no real code around them (closed in the independent-audit pass below,
  verified by a test that constructs exactly that comment-only case).
  Every validator in the round runs this same deterministic check against
  the same leader output — it doesn't re-generate its own answer and diff
  it against the leader's, which would fail non-deterministically for
  creative code generation (two independent implementations of the same
  request are rarely byte-identical).
- Only if enough validators agree does the round succeed. `generate()`
  explicitly checks for a `None` result before touching it — confirmed
  empirically (not theorized) that a leader response failing GenVM's own
  calldata encoding makes `run_nondet_unsafe` resolve to `None` rather than
  raise a Python exception inside `leader()`, so a `try/except` there
  cannot catch it.

**Round 2 — alignment judgment (`gl.eq_principle.prompt_non_comparative`).**
Once round 1's source/summary/confidence are agreed, a second, independent
round judges whether that *already-approved* source reasonably attempts
the original request:
- `alignment_fn()` asks the model to classify `"yes"`/`"partial"`/`"no"`
  with a short reason, given the prompt and the agreed source, and returns
  it JSON-encoded as a string (required by `prompt_non_comparative` --
  unlike `run_nondet_unsafe`, it needs `str`, not a dict).
- Every validator calls `alignment_fn()` independently (a fresh LLM call
  each time); GenLayer's own equivalence mechanism -- not this contract's
  code -- decides whether their judgments agree, per the `task`/`criteria`
  text passed to `prompt_non_comparative`.
- This is the platform-sanctioned mechanism for this pattern, not a
  hand-rolled one: a prior project's validator that made its own second
  `exec_prompt` call and compared results in plain Python hit a real,
  live `DETERMINISTIC_VIOLATION` on Bradbury's consensus protocol.
  `prompt_non_comparative` exists specifically to avoid that failure mode.
- `parse_alignment` defensively parses the round's result; a malformed or
  missing classification defaults to a clearly-labeled `"no"` rather than
  discarding an already-consensus-approved generation -- this round is
  enrichment, not a second hard gate on `generate()` succeeding.
- Verified live on Bradbury, not just in `gltest`'s mock: a real
  transaction produced `alignment: "yes"`, `alignment_reason: "The
  contract has a greeting string, a getter, and a setter as requested"` --
  a genuine, coherent, independently-derived judgment. The same
  transaction's `lastRound` showed 4/5 validators voting `AGREE` and 1
  `TIMEOUT`, a real, disclosed cost: two consensus rounds mean more
  wall-clock time and LLM calls than one, and that occasionally shows up
  as a validator timing out under real network conditions.

Both rounds' results are stored together in `generations: TreeMap[str, str]`
as one JSON record, and the sender's `generation_id` is appended to
`user_generations: TreeMap[str, str]` (a JSON array per address) for the
dashboard's exact "My Forges" index.

On the frontend, transaction progress maps directly onto GenLayer's real,
documented transaction lifecycle (`genlayer-js/types`'s `TransactionStatus`
enum): `PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED →
FINALIZED`, with `UNDETERMINED`/`CANCELED`/`VALIDATORS_TIMEOUT`/
`LEADER_TIMEOUT` as off-path outcomes, plus `APPEAL_COMMITTING` /
`APPEAL_REVEALING` / `READY_TO_FINALIZE` for the post-acceptance appeal
path -- all 14 real values are handled explicitly (an earlier version
silently treated 5 of them as "nothing has started yet"). `ConsensusVisualizer`
polls the real transaction via `client.getTransaction({ hash })` and
animates its 5-node pentagon directly off these values. There is no
fabricated timer standing in for consensus, and no invented per-validator
reasoning text: the GenLayer client API doesn't expose individual
validator votes, so `ValidatorCards` shows the two real things that exist
— the stored generation record and the independently-verified alignment
judgment — rather than inventing five different opinions.

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

VULCAN has been deployed four times on Bradbury as the contract evolved
(contracts are immutable once deployed, so any logic change requires a
fresh instance, not an upgrade):

- `0x135E3Fe73A0Eab53727E598459BceB22ec5BF57D` — original prompt, superseded.
- `0xf50543E8e15f4e09E7aF9D143549F165FA86F40d` — strengthened prompt
  (idiomatic storage-declaration guidance, an explicit non-determinism-
  boundary rule, and a minimal reference example), superseded.
- `0x19b04aa76f241db4B645fCF5d332513a6D18f5A4` — after the independent-audit
  fixes below (AST-based structural validation, a str-only TreeMap rule,
  `mark_deployed` access control), superseded.
- `0xEBFD0fb2431A4F114c0992E293ed05679028dd15` — current: adds the
  independent alignment round, the `user_generations` personal index, and
  `get_user_generations`. Live-verified end-to-end (see the consensus-flow
  section above).

All four are recorded in `contracts/addresses.json`; the frontend only
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
