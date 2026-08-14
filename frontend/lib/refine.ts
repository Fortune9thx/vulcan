const MAX_PROMPT_LENGTH = 3500;
const WRAPPER = (originalPrompt: string, source: string) =>
  `Refine the following GenLayer contract.\n\nOriginal request: "${originalPrompt}"\n\n` +
  `Existing source:\n${source}\n\nRefinement instructions: `;

/**
 * Builds the pre-filled prompt for "Forge a variant / Refine". The
 * contract enforces a 3500-character prompt limit, and a generated
 * source can itself run a few hundred to over a thousand characters, so
 * the combined template can exceed that limit for longer generations --
 * truncate the embedded source (clearly marked) rather than silently
 * producing a prompt the contract will reject on submit.
 */
export function buildRefinePrompt(originalPrompt: string, source: string): string {
  const full = WRAPPER(originalPrompt, source);
  if (full.length <= MAX_PROMPT_LENGTH) return full;

  const truncationMarker = "\n... (source truncated to fit the prompt length limit) ...\n";
  const overBy = full.length - MAX_PROMPT_LENGTH + truncationMarker.length;
  const truncatedSource = source.slice(0, Math.max(0, source.length - overBy)) + truncationMarker;
  return WRAPPER(originalPrompt, truncatedSource).slice(0, MAX_PROMPT_LENGTH);
}
