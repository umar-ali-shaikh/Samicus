// The curated clause library doubles as the "balanced baseline" for contract review: every
// clause is embedded into its own Qdrant collection so an uploaded contract's clauses can be
// matched to the nearest baseline clause semantically.
import { getSupabaseClient } from "./supabaseClient.js";
import { embedMany } from "./embeddings.js";
import { clauseCollection, collectionStats, ensureCollection, matchFilter, queryPoints, upsertPoints } from "./qdrant.js";
import { ragEnabled } from "./ingest.js";

const INDEXES = ["category"];

export async function indexClauseLibrary(): Promise<{ indexed: number; skipped?: boolean }> {
  if (!ragEnabled()) return { indexed: 0, skipped: true };
  const { data, error } = await getSupabaseClient()
    .from("clause_library")
    .select("id, title, body_template, rationale_note, disposition, risk_side, favors, template:doc_templates(id, category, name)");
  if (error) throw error;
  if (data.length === 0) return { indexed: 0 };

  const texts = data.map((c: any) => `${c.title}. ${c.body_template.replace(/\{\{(\w+)\}\}/g, "[$1]")}`);
  const vectors = await embedMany(texts, "RETRIEVAL_DOCUMENT");
  await ensureCollection(clauseCollection(), INDEXES);
  await upsertPoints(
    clauseCollection(),
    data.map((c: any, i: number) => ({
      id: c.id,
      vector: vectors[i]!,
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

export async function ensureClauseIndex(): Promise<void> {
  if (!ragEnabled()) return;
  const [{ count, error }, stats] = await Promise.all([
    getSupabaseClient().from("clause_library").select("*", { count: "exact", head: true }),
    collectionStats(clauseCollection()),
  ]);
  if (error) throw error;
  if (count && stats.points < count) await indexClauseLibrary();
}

export interface BaselineClauseMatch {
  clauseId: string;
  score: number;
  title: string;
  body: string;
  rationale: string | null;
  favors: string;
  disposition: string;
}

// 0.6 was dropping clearly-on-topic clauses that merely used different wording than the
// library's own baseline phrasing (a one-sided clause in particular often reads nothing
// like the balanced version it should be compared to) — lowered so more uploaded clauses
// actually get compared instead of silently falling through to "not assessed". Red flags
// (see contractReview.js's RED_FLAG_RULES) are checked independently of this threshold.
export async function matchBaselineClauses(segments: string[], category: string, { threshold = 0.45 }: { threshold?: number } = {}): Promise<(BaselineClauseMatch | null)[]> {
  if (!ragEnabled()) return segments.map(() => null);
  const vectors = await embedMany(segments, "RETRIEVAL_QUERY");
  const out: (BaselineClauseMatch | null)[] = [];
  for (const vector of vectors) {
    const [hit] = await queryPoints(clauseCollection(), vector, { limit: 1, filter: matchFilter("category", category), scoreThreshold: threshold });
    out.push(
      hit
        ? { clauseId: hit.payload.clause_id as string, score: hit.score, title: hit.payload.title as string, body: hit.payload.body as string, rationale: hit.payload.rationale as string | null, favors: hit.payload.favors as string, disposition: hit.payload.disposition as string }
        : null
    );
  }
  return out;
}
