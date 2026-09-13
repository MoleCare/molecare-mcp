/**
 * An egress check on tool results.
 *
 * A tool result does not stay on this machine. It is returned to the MCP
 * client, which puts it into the model's context — and when that client is
 * Claude Desktop, or anything else backed by a hosted model, the result has
 * just been sent to a third party.
 *
 * So the risky direction here is **outbound**. A tool that reads the MoleCare
 * API can return a real person's clinical narrative, and no pattern-based
 * scanner sees it, because it is prose in a tool result rather than a marker in
 * a prompt.
 *
 * This asks a local gate whether a result must stay on the machine. The gate is
 * an embedding model plus a 1024-weight logistic head; see
 * https://github.com/MoleCare/privacy-gate-llm. It is reached over HTTP so this
 * package carries no model weights and no new dependency.
 *
 * ## It is off unless configured
 *
 * With `PRIVACY_GATE_URL` unset — which is every published install — nothing
 * here runs and the server behaves exactly as it always has. molecare-mcp works
 * with no credentials and no services by design, and that must not change
 * because a privacy feature was added.
 *
 * ## What is checked, and what is not
 *
 * Everything except an allowlist of tools that return public reference material
 * (SNOMED and ICD-10 lookups, ABCDE education, risk-factor prompts). Those name
 * no person, and gating them would add an embedding call per lookup for nothing.
 *
 * The allowlist is the exemption rather than the rule on purpose: a tool added
 * later is checked by default, and someone has to think before exempting it.
 * The opposite default would mean a new tool that reads patient data is
 * unprotected until somebody remembers.
 */

const KNOWLEDGE_TOOLS = new Set([
  "search_medical_info",
  "search_medical_concepts",
  "lookup_medical_concept",
  "map_snomed_to_icd10",
  "get_condition_risk_factors",
  "get_condition_progression",
  "get_malignant_conditions",
  "classify_lesion_features",
  "assess_risk_from_factors",
]);

export interface GateConfig {
  readonly url: string | null;
  readonly timeoutMs: number;
}

export function gateConfig(env: NodeJS.ProcessEnv = process.env): GateConfig {
  const url = env.PRIVACY_GATE_URL?.trim();
  return {
    url: url ? url.replace(/\/$/, "") : null,
    timeoutMs: Number(env.PRIVACY_GATE_TIMEOUT_MS) || 4000,
  };
}

export function isChecked(tool: string): boolean {
  return !KNOWLEDGE_TOOLS.has(tool);
}

export interface GateVerdict {
  readonly hold: boolean;
  readonly score: number | null;
  /** True when the gate could not answer, so `hold` is the fail-closed default. */
  readonly unavailable: boolean;
}

const PASS: GateVerdict = { hold: false, score: null, unavailable: false };

/**
 * Ask the gate about one piece of text. Never throws.
 *
 * Fails closed. A gate that cannot answer must not be the reason a patient
 * record reached a hosted model, and the cost of being wrong in this direction
 * is a refused tool call, which the caller can see and retry.
 */
export async function checkResult(
  text: string,
  config: GateConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<GateVerdict> {
  if (!config.url || !text.trim()) return PASS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.url}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const body = (await response.json()) as { hold?: boolean; score?: number };
    if (!response.ok) {
      // The sidecar answers 503 with hold:true when its embedding endpoint is
      // down. Honour whatever it said, and hold if it said nothing useful.
      return { hold: body?.hold !== false, score: null, unavailable: true };
    }
    return { hold: Boolean(body.hold), score: body.score ?? null, unavailable: false };
  } catch {
    return { hold: true, score: null, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The text a gate should judge, pulled out of an MCP result.
 *
 * Only the text blocks. Binary content is not prose and the gate has nothing
 * useful to say about it.
 */
export function textOfResult(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}
