"""
Integration tests for Vulcan.py against a REAL GenLayer node over RPC
(localnet via `genlayer up`, GenLayer Studio, or Bradbury testnet) -- full
multi-validator consensus, real LLM calls. Unlike tests/direct/, this is
the only mode that actually exercises validator_fn (gltest's direct-mode
WASI mock only ever runs the leader function -- see tests/direct/test_vulcan.py
and docs/ARCHITECTURE.md for why that split exists).

Requirements to run this file:
  1. A running network reachable at the RPC URL in gltest.config.yaml, or
     pass --network on the command line (e.g. --network testnet_bradbury).
  2. A funded default account on that network.
  3. Validators configured with real LLM providers so gl.nondet.exec_prompt
     resolves for real -- there is no mock_llm equivalent here.

Run with:
    gltest tests/integration/test_vulcan_e2e.py -v --network testnet_bradbury

Confidence and validator agreement are empirical outcomes of the connected
LLM(s), not something this suite can force -- assertions are written to
hold regardless of the exact value returned, matching the real consensus
gate in contracts/Vulcan.py rather than assuming a specific model response.
"""
import json

import pytest
from gltest import get_contract_factory
from gltest.types import TransactionStatus

CONTRACT_NAME = "Vulcan"
CONFIDENCE_THRESHOLD = 0.55

VALID_PROMPT = (
    "Build a small Intelligent Contract that stores a single greeting "
    "string and exposes a getter and a setter for it."
)


@pytest.fixture
def contract(default_account):
    factory = get_contract_factory(CONTRACT_NAME)
    return factory.deploy(account=default_account)


class TestGenerateOverConsensus:
    def test_generate_reaches_consensus_and_stores_a_record(self, contract):
        generation_id = contract.generate(args=[VALID_PROMPT]).transact(
            wait_transaction_status=TransactionStatus.ACCEPTED
        )
        assert generation_id is not None

        raw = contract.get_generation(args=[str(generation_id)]).call()
        record = json.loads(raw)

        assert record["prompt"] == VALID_PROMPT
        assert isinstance(record["source"], str) and len(record["source"]) > 0
        assert isinstance(record["confidence"], str)
        confidence = float(record["confidence"])
        assert 0.0 <= confidence <= 1.0

    def test_get_count_increments_after_generate(self, contract):
        before = contract.get_count(args=[]).call()
        contract.generate(args=[VALID_PROMPT]).transact(
            wait_transaction_status=TransactionStatus.ACCEPTED
        )
        after = contract.get_count(args=[]).call()
        assert after == before + 1


class TestPromptLengthValidation:
    def test_prompt_too_short_reverts(self, contract):
        with pytest.raises(Exception):
            contract.generate(args=["too short"]).transact(
                wait_transaction_status=TransactionStatus.ACCEPTED
            )

    def test_prompt_too_long_reverts(self, contract):
        with pytest.raises(Exception):
            contract.generate(args=["x" * 3501]).transact(
                wait_transaction_status=TransactionStatus.ACCEPTED
            )


class TestMarkDeployedConfidenceGate:
    def test_mark_deployed_outcome_matches_stored_confidence(self, contract):
        generation_id = contract.generate(args=[VALID_PROMPT]).transact(
            wait_transaction_status=TransactionStatus.ACCEPTED
        )
        record = json.loads(contract.get_generation(args=[str(generation_id)]).call())
        confidence = float(record["confidence"])
        fake_address = "0x1234567890123456789012345678901234567890"

        if confidence >= CONFIDENCE_THRESHOLD:
            contract.mark_deployed(args=[str(generation_id), fake_address]).transact(
                wait_transaction_status=TransactionStatus.ACCEPTED
            )
            deployed = contract.get_deployed(args=[str(generation_id)]).call()
            assert deployed == fake_address
        else:
            with pytest.raises(Exception):
                contract.mark_deployed(args=[str(generation_id), fake_address]).transact(
                    wait_transaction_status=TransactionStatus.ACCEPTED
                )

    def test_mark_deployed_reverts_for_unknown_generation(self, contract):
        with pytest.raises(Exception):
            contract.mark_deployed(
                args=["no-such-id", "0x1234567890123456789012345678901234567890"]
            ).transact(wait_transaction_status=TransactionStatus.ACCEPTED)


class TestViewDefaults:
    def test_get_generation_unknown_id_returns_empty_json(self, contract):
        assert contract.get_generation(args=["no-such-id"]).call() == "{}"

    def test_get_deployed_unknown_id_returns_empty_string(self, contract):
        assert contract.get_deployed(args=["no-such-id"]).call() == ""
