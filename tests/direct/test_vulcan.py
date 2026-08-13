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
exercised here via direct_vm.run_validator(leader_result=...) instead.
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


def _generation_payload(source=VALID_SOURCE, summary="A greeting store.", confidence="0.85"):
    return {"source": source, "summary": summary, "confidence": confidence}


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
        assert direct_vm.run_validator() is True

    def test_low_confidence_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.4"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_confidence_exactly_at_threshold_passes(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="0.55"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is True

    def test_non_numeric_confidence_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(confidence="very confident"))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_missing_required_fragment_rejected(self, contract, direct_vm):
        broken_source = VALID_SOURCE.replace("from genlayer import *\n", "")
        _mock_leader(direct_vm, _generation_payload(source=broken_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_bare_list_type_annotation_rejected(self, contract, direct_vm):
        bad_source = VALID_SOURCE + "    items: list[str]\n"
        _mock_leader(direct_vm, _generation_payload(source=bad_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_bare_dict_type_annotation_rejected(self, contract, direct_vm):
        bad_source = VALID_SOURCE + "    meta: dict[str, str]\n"
        _mock_leader(direct_vm, _generation_payload(source=bad_source))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_empty_source_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload(source=""))
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator() is False

    def test_non_dict_leader_result_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(leader_result="not a dict") is False

    def test_leader_error_rejected(self, contract, direct_vm):
        _mock_leader(direct_vm, _generation_payload())
        contract.generate(VALID_PROMPT)
        assert direct_vm.run_validator(leader_error=Exception("leader crashed")) is False


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
