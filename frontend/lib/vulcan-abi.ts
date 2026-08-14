export const VULCAN_METHODS = {
  generate: "generate",
  getGeneration: "get_generation",
  getCount: "get_count",
  getDeployed: "get_deployed",
  markDeployed: "mark_deployed",
  getUserGenerations: "get_user_generations",
} as const;

export type Alignment = "yes" | "partial" | "no";

export interface GenerationRecord {
  prompt: string;
  source: string;
  summary: string;
  confidence: string;
  sender: string;
  alignment: Alignment;
  alignmentReason: string;
}

const VALID_ALIGNMENTS: Alignment[] = ["yes", "partial", "no"];

export function parseGenerationRecord(raw: string): GenerationRecord | null {
  if (!raw || raw === "{}") return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data.source !== "string") {
      console.warn("Generation record has a non-string/missing source field -- treating as empty.", data);
      return null;
    }
    if (typeof data.prompt !== "string" || typeof data.summary !== "string" || typeof data.sender !== "string") {
      // Not fatal -- the record still has real source/confidence -- but a
      // wrong-typed field here could be masking a real on-chain
      // serialization bug rather than a genuinely empty/low-confidence
      // generation, so it's worth a visible signal rather than a silent "".
      console.warn("Generation record has an unexpected shape for prompt/summary/sender.", data);
    }
    const alignment: Alignment = VALID_ALIGNMENTS.includes(data.alignment) ? data.alignment : "no";
    return {
      prompt: typeof data.prompt === "string" ? data.prompt : "",
      source: data.source,
      summary: typeof data.summary === "string" ? data.summary : "",
      confidence: String(data.confidence ?? "0"),
      sender: typeof data.sender === "string" ? data.sender : "",
      alignment,
      // Older generations (pre-alignment-round contract versions) won't
      // have this field -- default rather than show "undefined" in the UI.
      alignmentReason:
        typeof data.alignment_reason === "string" ? data.alignment_reason : "No reasoning was provided.",
    };
  } catch (err) {
    console.warn("Failed to parse generation record JSON.", err, raw);
    return null;
  }
}

export function parseGenerationIdList(raw: string): string[] {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export const CONFIDENCE_THRESHOLD = 0.55;

// The exact fallback text contracts/Vulcan.py's parse_alignment() stores
// when the alignment consensus round didn't produce a usable result (a
// validator disagreement/timeout in that round, not a judgment that the
// code fails to match the request) -- alignment defaults to "no" in this
// case, same as a genuine negative judgment, but the two mean very
// different things: "we checked and it doesn't match" vs. "the check
// itself didn't complete." Confirmed live: a real generation with 0.95
// confidence and an on-topic, well-formed contract still landed here,
// which would read as a real rejection without this distinction.
const INCONCLUSIVE_ALIGNMENT_REASON = "Alignment judgment could not be determined.";

export function isInconclusiveAlignment(alignment: Alignment, alignmentReason: string): boolean {
  return alignment === "no" && alignmentReason === INCONCLUSIVE_ALIGNMENT_REASON;
}

export function getVulcanAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VULCAN_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error(
      "NEXT_PUBLIC_VULCAN_CONTRACT_ADDRESS is not set. Deploy contracts/Vulcan.py " +
        "with scripts/deploy.mjs, then set this env var to the deployed address."
    );
  }
  return address as `0x${string}`;
}
