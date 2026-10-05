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

// Deterministic safety net, independent of embeddings/LLM availability — a handful of
// clause patterns are one-sided enough (per a legal QA pass) that they must ALWAYS be
// flagged, whether or not the baseline-matching/LLM pipeline caught them. Checked against
// every segment regardless of whether it matched a baseline clause.
export const RED_FLAG_RULES = [
  {
    id: "deposit_forfeiture_discretion",
    title: "Deposit forfeiture at sole discretion",
    test: /(?:security\s+)?deposit[\s\S]{0,150}?forfeit\w*[\s\S]{0,100}?(?:sole|absolute|unfettered|unilateral)\s+discretion|forfeit\w*[\s\S]{0,100}?(?:sole|absolute|unfettered|unilateral)\s+discretion[\s\S]{0,150}?deposit/i,
    note: "This clause lets the other side keep your whole deposit purely at their own discretion, with no standard (like actual damage) to justify it.",
    whyItMatters: "A deposit should normally be returned minus genuine, itemised deductions — forfeiting it entirely at one party's sole discretion removes your ability to dispute an unfair deduction.",
  },
  {
    id: "steep_periodic_rent_hike",
    title: "Steep, frequent rent increase",
    test: /(?:rent|lease\s+amount|licen[cs]e\s+fee)[\s\S]{0,120}?(?:increase|hike|escalat\w*)[\s\S]{0,80}?(?:1[5-9]|[2-9]\d)\s?%[\s\S]{0,100}?(?:every|each)\s+(?:three|3)\s+months|(?:1[5-9]|[2-9]\d)\s?%[\s\S]{0,120}?(?:every|each)\s+(?:three|3)\s+months/i,
    note: "This clause allows a large rent increase (15%+) every 3 months — far more frequent and steeper than the usual annual increase.",
    whyItMatters: "Frequent, steep increases can make the rent unaffordable within a year and are unusual for a residential lease.",
  },
  {
    id: "entry_without_notice",
    title: "Entry without notice",
    test: /enter[\s\S]{0,80}?(?:premises|property|flat|apartment|unit|house)[\s\S]{0,80}?without[\s\S]{0,40}?(?:prior\s+)?notice|without[\s\S]{0,40}?(?:prior\s+)?notice[\s\S]{0,80}?enter[\s\S]{0,80}?(?:premises|property|flat|apartment|unit|house)/i,
    note: "This clause lets the other party enter the premises without giving you advance notice.",
    whyItMatters: "You have a right to reasonable advance notice (commonly 24-48 hours) before a landlord/licensor enters — entry without notice undermines your privacy and possession rights.",
  },
  {
    id: "unilateral_arbitrator",
    title: "Unilateral arbitrator appointment",
    test: /arbitrator[\s\S]{0,100}?(?:appointed|selected|chosen|nominated)\s+(?:solely\s+)?by\s+(?:the\s+)?(?:landlord|licensor|owner|company|lessor|one\s+party)|sole\s+(?:discretion|option)[\s\S]{0,80}?appoint\w*[\s\S]{0,60}?arbitrator/i,
    note: "This clause lets only one party appoint the arbitrator, instead of a neutral or mutually agreed process.",
    whyItMatters: "An arbitrator appointed unilaterally by the other side is less likely to be neutral — fair arbitration clauses usually let both sides agree on the arbitrator or name a neutral institution.",
  },
];

/** @returns {{ id: string, title: string, note: string, whyItMatters: string }[]} every red-flag rule this clause's text matches */
export function detectRedFlags(text) {
  return RED_FLAG_RULES.filter((rule) => rule.test.test(text));
}

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
