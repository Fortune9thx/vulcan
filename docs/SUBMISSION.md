# VULCAN — Portal Submission Notes

**Live:** [vulcan-x9.vercel.app](https://vulcan-x9.vercel.app) · **Repo:**
[github.com/Fortune9thx/vulcan](https://github.com/Fortune9thx/vulcan) ·
**Contract:**
[`0xA7bE484beE1Ee5A83ffDFa370f2803F52605369F`](https://explorer-bradbury.genlayer.com/address/0xA7bE484beE1Ee5A83ffDFa370f2803F52605369F)
on GenLayer Bradbury

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
| Solves a real trust problem | See above, via two distinct consensus rounds. **Round 1 (structural):** a deterministic AST-based gate (legal storage types, real decorators, a real `gl.Contract` class, a syntactically valid parse) re-run by every validator against the leader's own proposal — bypass-proof against fragments hidden in comments/strings (verified by test), but a check of *legality*, not *intent*. **Round 2 (alignment):** a genuinely independent judgment via `gl.eq_principle.prompt_non_comparative` — the platform's own equivalence primitive, not a hand-rolled comparison — on whether the source reasonably attempts what was asked, classified `yes`/`partial`/`no` with a stated reason. This is live-verified, not theoretical: a real Bradbury transaction produced `alignment: "yes"`, reason `"The contract has a greeting string, a getter, and a setter as requested"` — a real, coherent, independently-checked judgment, not an echoed placeholder. What neither round buys: a guarantee the code is bug-free or production-ready. Round 1 verifies legality, round 2 verifies plausible intent-match; neither is a correctness proof, and the UI says so. |
| Uses live or authoritative data when outcomes depend on real-world facts | **Not applicable.** VULCAN's output (generated source code) doesn't depend on real-world facts to verify — its correctness is a property of the code itself, checked structurally at generation time. No live/authoritative data source was needed or added. |
| GenLayer is central to the main workflow | The generation step itself is a `gl.vm.run_nondet_unsafe` consensus call, not a wrapper around an off-chain API. Nothing about the core feature works without GenLayer. |
| Real Intelligent Contract + full transaction lifecycle | `contracts/Vulcan.py`, exercised end-to-end by the frontend and verified live on Bradbury: submit → real tx hash → real status polling across all 14 `TransactionStatus` values → read back the stored result → deploy the generated contract → record it back on `Vulcan`. |
| Complete source + accurate docs | This repo. `docs/ARCHITECTURE.md` explains the consensus flow and every deliberate design decision; `docs/HOW_TO_USE.md` covers running it. |
| Meaningfully different from boilerplate | A code-generation contract whose own output is itself a GenLayer contract, validated against GenLayer's own legality rules (storage types, decorators, runner header, AST structure) as part of consensus — not a generic chatbot-in-a-dApp wrapper. |
| Credible path to continued use | Every generation is permanently addressable (`get_generation`, `get_count`, `get_user_generations`, `/dashboard`, `/g/[id]`), and the deployed-address record (`get_deployed` / `mark_deployed`) means VULCAN accumulates a real, growing library of consensus-generated contracts builders can browse, filter, refine, and reuse. A per-user on-chain index (`user_generations`) makes "My Forges" exact, not a scan-dependent approximation. |

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
- **CI enforces all of the above on every push.**
  `.github/workflows/ci.yml` runs `genvm-lint` + the direct-mode test
  suite on the contract, and lint + a real type-check
  (`tsc --noEmit`, not just `next build`'s looser check) on the frontend.
- **Two independent non-deterministic mechanisms, composed correctly in one
  write method.** `generate()` runs `gl.vm.run_nondet_unsafe` (code
  generation) followed by `gl.eq_principle.prompt_non_comparative`
  (alignment judgment) — sequential, not nested, each validated with the
  API each is actually built for. Verified mechanically in `gltest`'s
  direct mode and confirmed live on Bradbury (both rounds completed,
  `ACCEPTED`/`AGREE`/`FINISHED_WITH_RETURN`).
- **Direct-mode + integration tests.** `tests/direct/test_vulcan.py` — 46
  passing tests covering the happy path, prompt-length validation, the
  validator's structural gate (via `direct_vm.run_validator`, the real
  API for exercising `run_nondet_unsafe`'s captured validator in gltest's
  WASI mock — including adversarial cases: fragments hidden in a comment,
  NaN/Infinity confidence, non-`str` TreeMap values, bare/`typing.List`/
  `typing.Dict` storage annotations, syntactically invalid source, a class
  with no public method), `mark_deployed`'s confidence gating/sender
  check/already-deployed guard, the `user_generations` personal index, and
  the alignment round's parsing/defaulting logic (valid classifications,
  invalid values, missing fields). `tests/direct/test_vulcan_redteam.py`
  adds an empirical, not just argued, proof of a disclosed limitation: a
  `TipJar` contract with an unrestricted fund-drain method — structurally
  legal, no access control at all — passes both the structural validator
  and the alignment round with a "yes" rating, confirming in a real test
  run (not a claim) that nothing downstream of the model catches a
  legal-but-malicious generation. `tests/integration/test_vulcan_e2e.py`
  exercises the same flows against a live network.

## Independent audit

Before submission, the contract, frontend, tests, architecture, and docs
were put through six independent zero-bias audits (contract correctness,
on-chain data/transaction layer, UI flow/duplication, test coverage, docs
accuracy, and Portal quality-bar skepticism) looking specifically for
reasons to reject the project. All 13 confirmed findings were fixed and
each is backed by a new or updated test — including a genuine, previously
undetected bug (a bare-float LLM response made `generate()` crash with an
unhandled `AttributeError`, confirmed empirically via `gltest`, not just
theorized) and an access-control gap in `mark_deployed`. Full detail in
`docs/ARCHITECTURE.md`.

## Security audit

A separate pass, after the correctness-focused independent audit above,
looked specifically at compromise: contract attack surface, prompt
injection (direct and indirect), frontend XSS/wallet-interaction risk,
and dependency supply chain. Full detail and evidence in
`docs/ARCHITECTURE.md`'s "Security audit" section. Headline points:

- The two consensus rounds check legality and topical fit, never
  malicious intent — a legitimate-sounding request could still yield
  code with hidden malicious logic and pass both rounds. This is a real
  edge of the trust model, not a bug; closed by disclosing it plainly
  (in-app and in docs) rather than claiming a guarantee no current
  GenLayer primitive can actually back.
- `mark_deployed`'s recorded address is self-reported by the original
  sender, with no on-chain way to verify it matches the generation's
  source — now disclosed directly next to every "Deployed" badge on the
  dashboard.
- `pnpm audit` found 18 dependency advisories (5 high); traced each to
  its actual reachability rather than reported blindly. One (`ws`, via
  WalletConnect's live relay connection) was genuinely exploitable and is
  now fixed via a version override; the rest were build-time-only paths
  this app never exercises with attacker-controlled input. Down to 1
  remaining (an unreachable, image-upload-only `sharp` advisory).
- Confirmed, not just assumed: the shiki-rendered `dangerouslySetInnerHTML`
  in `CodeViewer` is not an XSS vector (shiki escapes tokenized code), no
  backend/API routes exist to compromise, and no raw key material is ever
  handled by the frontend.
- Added baseline security headers (`frame-ancestors`/`X-Frame-Options`,
  `nosniff`, `Referrer-Policy`) — a page whose buttons trigger real wallet
  transactions had none before this pass.

## Hardened through live use, not just testing

After the security audit, the deployed app was actually used — by a real
person, with a real wallet, hitting real GenLayer network conditions —
and every bug that surfaced was root-caused against the actual chain
state before being called fixed, never guessed at from a screenshot:

- **A live storage-bypass bug**, found by an independent adversarial
  review agent and confirmed empirically (see `test_vulcan_redteam.py`
  above): `is_valid_generation` only checked subscripted `list[...]`/
  `dict[...]` storage annotations — a bare `items: list` or
  `items: typing.List[str]` sailed through untouched, undermining the one
  guarantee that check exists to make. Fixed and redeployed (the current
  live address, below).
- **A wallet-connection bug**: `useVulcanClient()` hardcoded
  `window.ethereum` as the transaction provider, which only happens to
  work when the connected wallet is the single injected extension a page
  sees — silently broken for WalletConnect, Coinbase Smart Wallet, Safe,
  or a second installed extension, even though wagmi's own connection
  state correctly showed "connected." Fixed to ask the actual connector
  for its real provider instead of guessing at a global.
- **A real `LEADER_TIMEOUT`**, hit live and traced to a specific, verified
  cause (every GenLayer chain defaults leader retry attempts to 3;
  `generate()`'s two sequential LLM rounds give one slow attempt more
  surface to exhaust that budget than a typical write) rather than
  shrugged off as "the network is sometimes slow" — `generateContract()`
  now explicitly requests 5 attempts for this specific call.
- **The core forge flow itself was stuck** for every user until this was
  found: the frontend polled for `FINALIZED` before showing the result,
  but `FINALIZED` settles GenLayer's appeal window and can take several
  minutes past `ACCEPTED` on Bradbury — while the generation's record is
  already fully readable the moment consensus is `ACCEPTED`. Verified
  directly (submitted a real `generate()` call, confirmed the record was
  readable via the same client the frontend uses, well before
  `FINALIZED`) before fixing the poll to stop at the right signal.
- **A misleading "Not aligned" state**: the alignment round's defensive
  fallback (used when that round's result isn't parseable — the same
  kind of validator disagreement/timeout any round can hit) and a
  genuine negative judgment both stored `alignment: "no"` and looked
  identical in the UI. A real generation with 0.95 confidence and clearly
  on-topic code displayed as rejected for a reason that had nothing to do
  with what it generated. Now visually distinguished as "Alignment
  inconclusive" instead of conflated with a real rejection.

Full root-cause detail and evidence for each: `docs/ARCHITECTURE.md`.

## Second consensus round: independent alignment verification

The original design (documented in the Independent audit section above)
disclosed a specific, honest limitation: the structural validator checks
legality, not whether the generated code plausibly does what was asked.
Closing that gap for real — not just rewording the claim — required a
second, genuinely independent consensus round, added after the audit:

- `generate()` now runs `gl.eq_principle.prompt_non_comparative` after the
  code-generation round completes, judging alignment (`yes`/`partial`/`no`
  + a short reason) between the original prompt and the *already-agreed*
  source.
- This uses the platform's own equivalence primitive rather than a
  hand-rolled "validator makes its own second LLM call and compares in
  Python" — that pattern is known (from a prior project) to hit a live
  `DETERMINISTIC_VIOLATION` on Bradbury's consensus protocol.
  `prompt_non_comparative` has every validator call the same judgment
  function independently; GenLayer's own equivalence mechanism, not this
  contract's code, decides whether their outputs agree.
- Verified mechanically first (`gltest`, with a purpose-built
  `ExecPromptTemplate` mock handler), then empirically live on Bradbury
  before being treated as trustworthy: a real transaction produced
  `alignment: "yes"`, `alignment_reason: "The contract has a greeting
  string, a getter, and a setter as requested"` — a genuine, coherent
  judgment, not a placeholder or an echo.
- Cost is real and disclosed, not hidden: the same live transaction showed
  4/5 validators voting `AGREE` and 1 `TIMEOUT` — the added round increases
  wall-clock time and LLM call count per `generate()`, and that shows up
  as occasional validator timeouts under real network conditions.
- The judgment is enrichment, not a second hard gate: a malformed or
  missing alignment result defaults to a clearly-labeled `"no"` rather
  than discarding an already-consensus-approved generation.
- A new on-chain personal index (`user_generations: TreeMap[str, str]`,
  JSON array of generation ids per sender) makes the dashboard's "My
  Forges" view exact rather than limited to whatever batch happened to be
  loaded — a second, independent improvement addressing the same
  "honestly disclosed but not fully solved" theme from the audit.

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
