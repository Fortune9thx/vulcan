export const VULCAN_METHODS = {
  generate: "generate",
  getGeneration: "get_generation",
  getCount: "get_count",
  getDeployed: "get_deployed",
  markDeployed: "mark_deployed",
} as const;

export interface GenerationRecord {
  prompt: string;
  source: string;
  summary: string;
  confidence: string;
  sender: string;
}

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
    return {
      prompt: typeof data.prompt === "string" ? data.prompt : "",
      source: data.source,
      summary: typeof data.summary === "string" ? data.summary : "",
      confidence: String(data.confidence ?? "0"),
      sender: typeof data.sender === "string" ? data.sender : "",
    };
  } catch (err) {
    console.warn("Failed to parse generation record JSON.", err, raw);
    return null;
  }
}

export const CONFIDENCE_THRESHOLD = 0.55;

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
