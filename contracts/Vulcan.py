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
                "You are an expert GenLayer Intelligent Contract generator. You write "
                "idiomatic, immediately deployable GenVM Python -- not generic Solidity-"
                "style pseudocode with GenLayer decorators bolted on.\n\n"
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
                "- Storage fields are PLAIN TYPED CLASS ATTRIBUTES, declared once at class "
                "level with a type annotation and assigned directly in __init__ -- e.g. "
                "`count: u256` then `self.count = u256(0)` in __init__. There is no "
                "StorageField, Field, or similar wrapper type -- never invent one.\n"
                "- Legal storage types only: str, u256, bool, Address, "
                "TreeMap[K,V] (K and V always concrete, e.g. TreeMap[str, str], never a "
                "bare TreeMap), and DynArray[T]. Never a bare list or dict as a storage "
                "type -- structured/repeated data goes in TreeMap/DynArray instead, "
                "typically as JSON-encoded str values via json.dumps/json.loads if the "
                "structure is richer than a single scalar.\n"
                "- Every public method needs exactly one decorator: @gl.public.view for "
                "reads that take no gas and never mutate storage, @gl.public.write for "
                "state-changing calls, @gl.public.write.payable only if the method needs "
                "to receive GEN (via gl.message.value).\n"
                "- Any non-deterministic operation (an LLM call, fetching a URL) may ONLY "
                "happen inside a function passed to gl.vm.run_nondet_unsafe(leader_fn, "
                "validator_fn) or gl.eq_principle.prompt_non_comparative(fn, task=..., "
                "criteria=...) / gl.eq_principle.prompt_comparative(fn, principle=...). "
                "Plain @gl.public.write methods must be otherwise deterministic -- never "
                "call gl.nondet.* directly outside one of those two wrapping mechanisms.\n"
                "- prompt_non_comparative's wrapped function must return str (not a dict), "
                "even if you use exec_prompt(response_format=\"json\") internally -- "
                "json.dumps the parsed result back to a string before returning it.\n"
                "- Validate every write method's inputs at the top and fail closed: "
                "`raise gl.vm.UserError(\"message\")` on bad input, never a bare "
                "`raise Exception(...)` and never silently coercing invalid data.\n"
                "- GenVM calldata has no float type: any numeric value that isn't an "
                "integer (a confidence score, a ratio, an average) must be handled as a "
                "string -- format it with str()/f-strings before storing or returning it, "
                "and float() it back only for in-memory comparisons.\n"
                '- "confidence" MUST be a quoted JSON string like "0.85", '
                "never a bare JSON number like 0.85 -- a bare number crashes the caller\n"
                "- If the request cannot be safely expressed under GenLayer rules, "
                'set confidence to a low string value such as "0.3"\n\n'
                "Minimal reference example of correct idiom (a counter contract) -- match "
                "this shape, not a generic Ethereum-style pattern:\n"
                '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
                "from genlayer import *\n\n"
                "class Counter(gl.Contract):\n"
                "    value: u256\n"
                "    labels: TreeMap[str, str]\n\n"
                "    def __init__(self):\n"
                "        self.value = u256(0)\n\n"
                "    @gl.public.view\n"
                "    def get_value(self) -> u256:\n"
                "        return self.value\n\n"
                "    @gl.public.write\n"
                "    def increment(self, label: str) -> None:\n"
                "        if len(label) == 0:\n"
                '            raise gl.vm.UserError("label must not be empty")\n'
                "        self.value += u256(1)\n"
                "        self.labels[str(int(self.value))] = label\n\n"
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
