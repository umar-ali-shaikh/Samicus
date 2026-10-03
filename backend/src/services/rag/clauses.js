// The curated clause library doubles as the "balanced baseline" for contract review: every
// clause is embedded into its own Qdrant collection so an uploaded contract's clauses can be
// matched to the nearest baseline clause semantically.
import { getSupabase } from "../../config/db.js";
import { embedMany, embedTexts } from "../gemini.js";
import { clauseCollection, collectionStats, ensureCollection, matchFilter, queryPoints, upsertPoints } from "./qdrant.js";
import { ragEnabled } from "./ingest.js";

const INDEXES = ["category"];

export async function indexClauseLibrary() {
  if (!ragEnabled()) return { indexed: 0, skipped: true };
  const { data, error } = await getSupabase()
    .from("clause_library")
    .select("id, title, body_template, rationale_note, disposition, risk_side, favors, template:doc_templates(id, category, name)");
  if (error) throw error;
  if (data.length === 0) return { indexed: 0 };

  const texts = data.map((c) => `${c.title}. ${c.body_template.replace(/\{\{(\w+)\}\}/g, "[$1]")}`);
  const vectors = await embedMany(texts, "RETRIEVAL_DOCUMENT");
  await ensureCollection(clauseCollection(), INDEXES);
  await upsertPoints(
    clauseCollection(),
    data.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      payload: {
        clause_id: c.id,
        category: c.template?.category,
        template_name: c.template?.name,
        title: c.title,
        body: texts[i],
        rationale: c.rationale_note,
        disposition: c.disposition,
        risk_side: c.risk_side,
        favors: c.favors,
      },
    }))
  );
  return { indexed: data.length };
}

export async function ensureClauseIndex() {
  if (!ragEnabled()) return;
  const [{ count, error }, stats] = await Promise.all([
    getSupabase().from("clause_library").select("*", { count: "exact", head: true }),
    collectionStats(clauseCollection()),
  ]);
  if (error) throw error;
  if (count > 0 && stats.points < count) await indexClauseLibrary();
}

/**
 * Nearest baseline clause for each segment.
 * @returns {Promise<({ clauseId: string, score: number, title: string, body: string, rationale: string|null, favors: string, disposition: string }|null)[]>}
 */
export async function matchBaselineClauses(segments, category, { threshold = 0.6 } = {}) {
  if (!ragEnabled()) return segments.map(() => null);
  const vectors = await embedMany(segments, "RETRIEVAL_QUERY");
  const out = [];
  for (const vector of vectors) {
    const [hit] = await queryPoints(clauseCollection(), vector, { limit: 1, filter: matchFilter("category", category), scoreThreshold: threshold });
    out.push(
      hit
        ? { clauseId: hit.payload.clause_id, score: hit.score, title: hit.payload.title, body: hit.payload.body, rationale: hit.payload.rationale, favors: hit.payload.favors, disposition: hit.payload.disposition }
        : null
    );
  }
  return out;
}

export { embedTexts };
