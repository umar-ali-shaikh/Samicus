// Contract review = retrieval (nearest baseline clause in Qdrant) + a grounded comparison.
// The model only ever sees the uploaded clause, the matched baseline clause and the library's
// own rationale note — it is told not to introduce law or numbers that are not in them.
import { z } from "zod";
import { chatCompletion } from "./openRouter.js";

const MAX_JUDGED = 20;

const SYSTEM = `You compare clauses of an Indian commercial/consumer contract against a balanced baseline clause. You are not a lawyer and this is not legal advice.

For each item you get the UPLOADED clause, the BASELINE clause it was matched to, and a RATIONALE written by the platform's reviewing advocates.
Rules:
- Judge only from the three texts provided. Do not cite any statute, section number, case or figure that does not appear in them.
- "favours" is from the point of view of the person who uploaded the contract: "you" if the clause is more favourable to them than the baseline, "counterparty" if more favourable to the other side, "balanced" if it is materially equivalent.
- Be concrete and brief (max 2 sentences per field). If the uploaded clause is unrelated to the baseline despite the match, return favours "balanced" and say it could not be compared.
Output STRICT JSON only: {"findings":[{"index":number,"favours":"you"|"counterparty"|"balanced","deviation":string,"whyItMatters":string|null,"ask":string|null}]}`;

const ResultSchema = z.object({
  findings: z.array(
    z.object({
      index: z.number(),
      favours: z.enum(["you", "counterparty", "balanced"]),
      deviation: z.string(),
      whyItMatters: z.string().nullable().optional(),
      ask: z.string().nullable().optional(),
    })
  ),
});

function parseJson(raw) {
  const fenced = (/```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw).trim();
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(fenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const FAVOURS_TO_DB = { you: "drafter", counterparty: "counterparty", balanced: "balanced" };

/**
 * @param {{ index: number, text: string, baseline: { title: string, body: string, rationale: string|null } }[]} items
 * @returns {Promise<Map<number, {favors: string, deviation: string, whyItMatters: string|null, ask: string|null}>|null>} null if the model is unavailable
 */
export async function judgeClauses(items) {
  const batch = items.slice(0, MAX_JUDGED);
  if (batch.length === 0) return new Map();
  const user = batch
    .map((it) => `### Item ${it.index}\nUPLOADED: ${it.text.slice(0, 1500)}\nBASELINE (${it.baseline.title}): ${it.baseline.body.slice(0, 800)}\nRATIONALE: ${it.baseline.rationale || "none"}`)
    .join("\n\n");

  let raw;
  try {
    raw = await chatCompletion([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { jsonMode: true });
  } catch (err) {
    console.error("Contract review judgement unavailable:", err.message);
    return null;
  }
  const parsed = ResultSchema.safeParse(parseJson(raw));
  if (!parsed.success) return null;

  const valid = new Set(batch.map((b) => b.index));
  const out = new Map();
  for (const f of parsed.data.findings) {
    if (!valid.has(f.index)) continue;
    out.set(f.index, { favors: FAVOURS_TO_DB[f.favours], deviation: f.deviation, whyItMatters: f.whyItMatters || null, ask: f.ask || null });
  }
  return out;
}
