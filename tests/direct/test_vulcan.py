"""
Direct-mode tests for Vulcan.py.

Uses gltest's in-process WASI-mock VM (no localnet/simulator needed):
  - direct_deploy -> deploys contracts/Vulcan.py, returns a proxy whose
                     public methods are called directly.
  - direct_vm     -> Foundry-style cheatcodes: vm.mock_llm(pattern, response)
                     stubs gl.nondet.exec_prompt; vm.run_validator(...) runs
                     the validator_fn captured from the most recent
                     gl.vm.run_nondet_unsafe call (gltest's WASI mock only
                     ever executes the leader function automatically -- the
                     validator is captured but never auto-invoked, since
                     there is no way to simulate real multi-validator
                     disagreement in a single-process mock).

generate() calls gl.vm.run_nondet_unsafe(leader, validator) once. In direct
mode this just runs leader() and returns its result unconditionally -- the
structural/confidence gate in `validator` (real rejection happens as a
consensus-level failure on live GenLayer, not inside generate() itself) is
exercised here via direct_vm.run_validator(index=0, leader_result=...) instead.
"""
import json

import pytest

CONTRACT_PATH = "contracts/Vulcan.py"

VALID_SOURCE = (
    '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
    "from genlayer import *\n"
    "class Example(gl.Contract):\n"
    "    value: str\n"
    "    @gl.public.view\n"
    "    def get_value(self) -> str:\n"
    "        return self.value\n"
)

VALID_PROMPT = "Build a contract that stores a single greeting string and exposes a getter."


def _generation_payload(
    source=VALID_SOURCE, summary="A greeting store.", confidence="0.85", alignment=None, reason=None
):
    payload = {"source": source, "summary": summary, "confidence": confidence}
    # alignment_fn's own exec_prompt call shares the same ".*" mock as the
    # leader's, so whatever alignment/reason keys are present here are what
    # the second consensus round's leader_fn actually observes too --
    # these tests set them explicitly to exercise parse_alignment's real
    # branches through the genuine contract execution path, not a
    # simulated/guessed one.
    if alignment is not None:
        payload["alignment"] = alignment
    if reason is not None:
        payload["reason"] = reason
    return payload


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy(CONTRACT_PATH, sdk_version="v0.2.16")


def _mock_leader(direct_vm, payload: dict):
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", json.dumps(payload))


class TestGenerateHappyPath:
    def test_generate_stores_and_returns_incrementing_ids(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())

        first_id = contract.generate(VALID_PROMPT)
        second_id = contract.generate(VALID_PROMPT)

        assert first_id == "0"
        assert second_id == "1"
        assert contract.get_count() == 2

    def test_get_generation_round_trips_stored_record(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(summary="Stores a greeting."))

        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["prompt"] == VALID_PROMPT
        assert stored["source"] == VALID_SOURCE
        assert stored["summary"] == "Stores a greeting."
        assert stored["confidence"] == "0.85"
        assert "sender" in stored

    def test_get_generation_unknown_id_returns_empty_json(self, contract, direct_vm):
        assert contract.get_generation("no-such-id") == "{}"

    def test_get_deployed_unknown_id_returns_empty_string(self, contract, direct_vm):
        assert contract.get_deployed("no-such-id") == ""

    def test_get_count_starts_at_zero(self, contract, direct_vm):
        assert contract.get_count() == 0


class TestPromptLengthValidation:
    def test_prompt_too_short_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        with pytest.raises(Exception):
            contract.generate("too short")

    def test_prompt_too_long_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        with pytest.raises(Exception):
            contract.generate("x" * 3501)

    def test_prompt_at_min_boundary_accepted(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        prompt = "x" * 30
        generation_id = contract.generate(prompt)
        assert generation_id == "0"

    def test_prompt_at_max_boundary_accepted(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        prompt = "x" * 3500
        generation_id = contract.generate(prompt)
        assert generation_id == "0"


class TestValidatorStructuralGate:
    """Exercises the captured validator_fn directly via direct_vm.run_validator
    -- the real gate that prevents a malformed/low-confidence generation from
    ever reaching consensus on live GenLayer."""

    def test_valid_payload_passes(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.85"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is True

    def test_low_confidence_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.4"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_confidence_exactly_at_threshold_passes(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.55"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is True

    def test_non_numeric_confidence_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="very confident"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_missing_required_fragment_rejected(self, contract, direct_vm):
        broken_source = VALID_SOURCE.replace("from genlayer import *\n", "")
        _mock_leader(direct_vm, _generation_payload(source=broken_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_bare_list_type_annotation_rejected(self, contract, direct_vm):
        bad_source = VALID_SOURCE + "    items: list[str]\n"
        _mock_leader(direct_vm, _generation_payload(source=bad_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_bare_dict_type_annotation_rejected(self, contract, direct_vm):
        bad_source = VALID_SOURCE + "    meta: dict[str, str]\n"
        _mock_leader(direct_vm, _generation_payload(source=bad_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_empty_source_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(source=""))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_non_dict_leader_result_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0, leader_result="not a dict") is False

    def test_leader_error_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0, leader_error=Exception("leader crashed")) is False

    def test_nan_confidence_rejected(self, contract, direct_vm):
        # float("nan") < CONFIDENCE_THRESHOLD is False in Python -- this only
        # passes if is_valid_generation explicitly checks math.isfinite().
        _mock_leader(direct_vm, _generation_payload(confidence="nan"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_infinite_confidence_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="inf"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_required_fragments_hidden_in_a_comment_are_rejected(self, contract, direct_vm):
        # A pure substring check would be fooled by this -- the real fragments
        # are present as text, but there is no actual import/class/decorator.
        fake_source = (
            '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
            "# fake: from genlayer import * -- gl.Contract -- @gl.public.\n"
            "x = 1\n"
        )
        _mock_leader(direct_vm, _generation_payload(source=fake_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_non_str_treemap_value_type_rejected(self, contract, direct_vm):
        # TreeMap[str, u256] (or any non-str value type) deploys fine on
        # Bradbury but becomes permanently unreadable afterward -- must be
        # rejected at generation time, not merely discouraged in the prompt.
        bad_source = VALID_SOURCE.replace(
            "    value: str\n", "    value: str\n    counts: TreeMap[str, u256]\n"
        )
        _mock_leader(direct_vm, _generation_payload(source=bad_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_variable_named_list_is_not_a_false_positive(self, contract, direct_vm):
        # A real class-level `x: list[str]` annotation must be rejected, but
        # a plain local variable that merely contains "list" in its name
        # must NOT be -- proves the check is annotation-aware, not a raw
        # substring scan over the whole source.
        source_with_list_named_var = VALID_SOURCE.replace(
            "        return self.value\n",
            "        my_list = [1, 2, 3]\n        return self.value\n",
        )
        _mock_leader(direct_vm, _generation_payload(source=source_with_list_named_var))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is True

    def test_syntactically_invalid_source_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(source="def broken(:\n    pass"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False

    def test_class_without_public_method_rejected(self, contract, direct_vm):
        no_public_method = (
            '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
            "from genlayer import *\n"
            "class Example(gl.Contract):\n"
            "    value: str\n"
            "    def internal_helper(self) -> str:\n"
            "        return self.value\n"
        )
        _mock_leader(direct_vm, _generation_payload(source=no_public_method))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(index=0) is False


class TestUnreachableConsensus:
    def test_bare_float_confidence_from_llm_raises_clean_error_not_a_crash(self, contract, direct_vm):
        # Empirically confirmed (not theorized): when the mocked LLM's own
        # JSON contains a bare float, GenVM's calldata encoder fails while
        # crossing the gl_call boundary and gl.vm.run_nondet_unsafe resolves
        # to None -- it does NOT raise a Python exception inside leader(),
        # so a try/except there cannot catch it. generate() must guard
        # against a None result explicitly or it crashes with an unhandled
        # AttributeError on result.get(...).
        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            ".*", json.dumps({"source": VALID_SOURCE, "summary": "x", "confidence": 0.85})
        )
        with pytest.raises(Exception):
            contract.generate(VALID_PROMPT)


class TestMarkDeployed:
    def test_mark_deployed_succeeds_for_high_confidence_generation(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.9"))
        generation_id = contract.generate(VALID_PROMPT)

        contract.mark_deployed(generation_id, "0x1234567890123456789012345678901234567890")

        assert contract.get_deployed(generation_id) == "0x1234567890123456789012345678901234567890"

    def test_mark_deployed_rejected_below_confidence_threshold(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.2"))
        generation_id = contract.generate(VALID_PROMPT)

        with pytest.raises(Exception):
            contract.mark_deployed(generation_id, "0x1234567890123456789012345678901234567890")

        assert contract.get_deployed(generation_id) == ""

    def test_mark_deployed_rejected_for_unknown_generation(self, contract, direct_vm):
        with pytest.raises(Exception):
            contract.mark_deployed("no-such-id", "0x1234567890123456789012345678901234567890")

    def test_mark_deployed_twice_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.9"))
        generation_id = contract.generate(VALID_PROMPT)
        contract.mark_deployed(generation_id, "0x1234567890123456789012345678901234567890")

        with pytest.raises(Exception):
            contract.mark_deployed(generation_id, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

        # The original address must survive the rejected second attempt.
        assert contract.get_deployed(generation_id) == "0x1234567890123456789012345678901234567890"

    def test_mark_deployed_rejects_malformed_address(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.9"))
        generation_id = contract.generate(VALID_PROMPT)

        with pytest.raises(Exception):
            contract.mark_deployed(generation_id, "not-an-address")

        assert contract.get_deployed(generation_id) == ""


class TestUserGenerationsIndex:
    def test_starts_empty_for_unknown_user(self, contract, direct_vm):
        assert contract.get_user_generations("0x1234567890123456789012345678901234567890") == "[]"

    def test_records_generation_id_for_sender(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        generation_id = contract.generate(VALID_PROMPT)
        sender = json.loads(contract.get_generation(generation_id))["sender"]

        ids = json.loads(contract.get_user_generations(sender))
        assert ids == [generation_id]

    def test_accumulates_across_multiple_generations_from_same_sender(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        first_id = contract.generate(VALID_PROMPT)
        second_id = contract.generate(VALID_PROMPT)
        sender = json.loads(contract.get_generation(first_id))["sender"]

        ids = json.loads(contract.get_user_generations(sender))
        assert ids == [first_id, second_id]


class TestAlignmentSecondConsensusRound:
    """The second consensus round (gl.eq_principle.prompt_non_comparative,
    called from generate() after the code-gen round completes) shares the
    same ".*" gl.nondet.exec_prompt mock as the leader's own call --
    alignment_fn's inner exec_prompt call sees the exact same payload, so
    setting alignment/reason on _generation_payload exercises the real
    parse_alignment code path through the genuine contract execution,
    not a simulated one. This also proves the two nondet rounds compose
    correctly in one write method without crashing."""

    def test_valid_yes_alignment_is_stored_as_is(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(alignment="yes", reason="Clearly does what was asked."))
        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["alignment"] == "yes"
        assert stored["alignment_reason"] == "Clearly does what was asked."

    def test_valid_partial_alignment_is_stored_as_is(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(alignment="partial", reason="Missing an edge case."))
        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["alignment"] == "partial"
        assert stored["alignment_reason"] == "Missing an edge case."

    def test_invalid_alignment_value_defaults_to_no(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(alignment="maybe", reason="Uncertain."))
        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["alignment"] == "no"
        assert stored["alignment_reason"] == "Uncertain."

    def test_missing_alignment_fields_default_safely(self, contract, direct_vm):
        # No alignment/reason keys in the mocked payload at all.
        _mock_leader(direct_vm, _generation_payload())
        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["alignment"] == "no"
        assert stored["alignment_reason"] == "No reasoning was provided."

    def test_generation_still_succeeds_even_if_alignment_round_is_degenerate(self, contract, direct_vm):
        # The alignment round is enrichment, not a hard gate -- a
        # low-information response from it must never discard an
        # already-consensus-approved source.
        _mock_leader(direct_vm, _generation_payload(alignment="garbage-value"))
        generation_id = contract.generate(VALID_PROMPT)
        stored = json.loads(contract.get_generation(generation_id))

        assert stored["source"] == VALID_SOURCE
        assert stored["alignment"] == "no"
