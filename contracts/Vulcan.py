# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

# Deliberately not phrased as a quoted key/value pair resembling the real
# header comment on line 1 above -- gltest's SDK-version auto-detector
# scans the whole first ~2000 bytes of the file for that shape (not just
# line 1), so a second lookalike anywhere else corrupts SDK detection.
PINNED_DEPENDENCY = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
CONFIDENCE_THRESHOLD = 0.55
REQUIRED_SOURCE_FRAGMENTS = [
    "from genlayer import *",
    "gl.Contract",
    "@gl.public.",
    PINNED_DEPENDENCY,
]


def is_valid_generation(data) -> bool:
    # Pure structural/confidence gate, kept free of any gl.* calls so it can
    # be unit-tested directly -- gltest's WASI mock only ever runs
    # run_nondet_unsafe's leader function, never its validator function, so
    # this logic is otherwise unreachable from a direct-mode test suite.
    if not isinstance(data, dict):
        return False
    source = data.get("source", "")
    if not isinstance(source, str) or len(source) == 0:
        return False
    try:
        confidence = float(data.get("confidence", "0"))
    except (TypeError, ValueError):
        return False
    if confidence < CONFIDENCE_THRESHOLD:
        return False
    if not all(fragment in source for fragment in REQUIRED_SOURCE_FRAGMENTS):
        return False
    if "list[" in source or "dict[" in source:
        return False
    return True


class Vulcan(gl.Contract):
    # Only TreeMap[str, str] is reliable on Bradbury -- non-str value types
    # (Address, u256, dataclass, bool) deploy but become permanently unreadable.
    generations: TreeMap[str, str]
    deployed: TreeMap[str, str]
    generation_count: u256
    owner: Address

    def __init__(self):
        self.owner = gl.message.sender_address
        self.generation_count = u256(0)

    @gl.public.view
    def get_generation(self, generation_id: str) -> str:
        return self.generations.get(generation_id, "{}")

    @gl.public.view
    def get_deployed(self, generation_id: str) -> str:
        return self.deployed.get(generation_id, "")

    @gl.public.view
    def get_count(self) -> u256:
        return self.generation_count

    @gl.public.write
    def generate(self, prompt: str) -> str:
        if len(prompt) < 30 or len(prompt) > 3500:
            raise gl.vm.UserError("Prompt length must be 30-3500 characters")

        generation_id = str(int(self.generation_count))

        def leader() -> dict:
            system_prompt = (
                "You are a strict GenLayer Intelligent Contract generator.\n"
                "Output ONLY a JSON object with these exact keys:\n"
                "{\n"
                '  "source": "full valid Python source code",\n'
                '  "summary": "one-sentence description",\n'
                '  "confidence": "decimal string between \\"0.0\\" and \\"1.0\\", '
                'e.g. \\"0.85\\" -- MUST be a quoted JSON string, never a bare number"\n'
                "}\n\n"
                "HARD RULES you must obey:\n"
                "- First line must be the exact Depends header: "
                '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
                "- from genlayer import *\n"
                "- class X(gl.Contract):\n"
                "- Storage fields only with legal GenLayer types "
                "(str, u256, bool, Address, TreeMap[K,V], DynArray[T])\n"
                "- Methods must use @gl.public.view or @gl.public.write or @gl.public.write.payable\n"
                "- Any non-deterministic code (LLM prompts, web calls) must go through "
                "gl.nondet.exec_prompt, gl.eq_principle.*, or gl.vm.run_nondet_unsafe\n"
                "- Never use list[] or dict[] as storage types -- only TreeMap / DynArray\n"
                '- "confidence" MUST be a quoted JSON string like "0.85", '
                "never a bare JSON number like 0.85 -- a bare number crashes the caller\n"
                "- If the request cannot be safely expressed under GenLayer rules, "
                'set confidence to a low string value such as "0.3"\n\n'
                "User request:\n" + prompt
            )
            return gl.nondet.exec_prompt(system_prompt, response_format="json")

        def validator(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            return is_valid_generation(leaders_res.calldata)

        result = gl.vm.run_nondet_unsafe(leader, validator)

        record = {
            "prompt": prompt,
            "source": result.get("source", ""),
            "summary": result.get("summary", ""),
            # Consensus already confirmed this parses as a float string; stored as-is.
            "confidence": str(result.get("confidence", "0")),
            "sender": str(gl.message.sender_address),
        }
        self.generations[generation_id] = json.dumps(record)
        self.generation_count += u256(1)
        return generation_id

    @gl.public.write
    def mark_deployed(self, generation_id: str, contract_address: str) -> None:
        raw = self.generations.get(generation_id, "")
        if not raw:
            raise gl.vm.UserError("Generation does not exist")
        data = json.loads(raw)
        if float(data.get("confidence", "0")) < CONFIDENCE_THRESHOLD:
            raise gl.vm.UserError("Cannot deploy a generation that failed validation")
        self.deployed[generation_id] = contract_address
