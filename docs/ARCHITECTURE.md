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
