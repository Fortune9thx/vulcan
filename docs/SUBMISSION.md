# VULCAN — Portal Submission Notes

## The trust problem

Anyone can ask an LLM to write a smart contract. Nobody can trust the
result, because a single off-chain model call has no accountability: it
can hallucinate, drift, or simply be wrong, and there's no way to tell
after the fact whether the output was ever checked by anything other than
the model that produced it. VULCAN answers "can I trust an AI-generated
Intelligent Contract without trusting any single off-chain model or
centralized service?" by making the generation step itself a GenLayer
consensus decision: a leader proposes, every validator in the round
independently re-checks the proposal against the same objective rules, and
only an agreed-upon result is ever stored.

## Quality-bar mapping

| Requirement | How VULCAN satisfies it |
|---|---|
| Solves a real trust problem | See above — trustworthy AI code generation without a centralized arbiter. |
| GenLayer is central to the main workflow | The generation step itself is a `gl.vm.run_nondet_unsafe` consensus call, not a wrapper around an off-chain API. Nothing about the core feature works without GenLayer. |
| Real Intelligent Contract + full transaction lifecycle | `contracts/Vulcan.py`, exercised end-to-end by the frontend: submit → real tx hash → real status polling (`PENDING…FINALIZED`) → read back the stored result → deploy the generated contract → record it back on `Vulcan`. |
| Complete source + accurate docs | This repo. `docs/ARCHITECTURE.md` explains the consensus flow and every deliberate design decision; `docs/HOW_TO_USE.md` covers running it. |
| Meaningfully different from boilerplate | A code-generation contract whose own output is itself a GenLayer contract, validated against GenLayer's own legality rules (storage types, decorators, runner header) as part of consensus — not a generic chatbot-in-a-dApp wrapper. |
| Credible path to continued use | Every generation is permanently addressable (`get_generation`, `get_count`, `/history`), and the deployed-address record (`get_deployed` / `mark_deployed`) means VULCAN accumulates a real, growing library of consensus-generated contracts builders can browse and reuse. |

## GenLayer Skills compliance

- **Pinned runner header.** `contracts/Vulcan.py` line 1 is exactly
  `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`,
  verified against current GenLayer example contracts.
- **Legal storage types only.** `TreeMap[str, str]`, `u256`, `Address` as a
  scalar field, `str`. No bare `list`/`dict`, no non-`str` `TreeMap` value
  (see Platform Corrections below for why that specific rule matters).
- **Correct decorators.** `@gl.public.view` on all three read methods,
  `@gl.public.write` on `generate`/`mark_deployed`.
- **Clear non-deterministic boundary.** All LLM interaction happens inside
  `leader()`/`validator()`, passed to `gl.vm.run_nondet_unsafe` — nothing
  outside that boundary touches the model.
- **Structured JSON + custom equivalence validation.** The leader is asked
  for structured JSON; `validator`/`is_valid_generation` is a custom
  equivalence check (structural + confidence-threshold), not a strict
  string comparison on LLM output — a strict-equality check would reject
  almost every valid generation, since two independent calls rarely
  produce byte-identical code.
- **LLM resilience.** Confidence threshold (`0.55`) is fail-closed: below
  it, the validator rejects and `mark_deployed` independently re-checks
  the same threshold against stored data, so a low-confidence generation
  can never be marked deployed even if a caller bypasses the frontend.
- **genvm-lint clean.** `genvm-lint check contracts/Vulcan.py` passes with
  0 findings.
- **Direct-mode + integration tests.** `tests/direct/test_vulcan.py` — 22
  passing tests covering the happy path, prompt-length validation, the
  validator's structural gate (via `direct_vm.run_validator`, the real
  API for exercising `run_nondet_unsafe`'s captured validator in gltest's
  WASI mock), and `mark_deployed`'s confidence gating.
  `tests/integration/test_vulcan_e2e.py` exercises the same flows against
  a live network.

## Platform corrections (evidence, not guesswork)

Two changes were made to the originally specified contract after checking
it against previously live-tested GenLayer platform behavior, both
re-verified against current GenLayer documentation before being applied:

1. **`deployed: TreeMap[str, str]`, not `TreeMap[str, Address]`.** Prior
   pilot testing on Bradbury (deploying a `TreeMap[str, u256]` /
   `TreeMap[str, bool]` control alongside a `TreeMap[str, str]` control)
   showed every non-`str` `TreeMap` value type deploys successfully
   (`ACCEPTED`) but the contract becomes permanently unreadable
   immediately afterward — no error, just silently dead. `TreeMap[str, str]`
   read back correctly on the very first attempt. Storing the deployed
   address as a hex string, rather than risking an untested `Address`
   value type, is the verified-safe choice.
2. **Confidence is requested and stored as a quoted string.** GenVM's
   calldata encoding has no float type. `gl.nondet.exec_prompt(...,
   response_format="json")`'s JSON auto-parse crosses that same calldata
   boundary, so a bare `0.85` in the model's JSON response would crash
   inside `leader()` on every call, before the contract ever gets a
   chance to validate anything. The system prompt instructs the model
   explicitly to quote the field, and the contract parses it with
   `float()` on its own side.

Full reasoning and code references for both: `docs/ARCHITECTURE.md`.
