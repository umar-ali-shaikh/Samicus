/**
 * DB access for the founder (Command Centre analytics) domain. Ported from
 * services/analytics/index.js's rows()/count() helpers -- same queries, same behaviour. The
 * analytics functions themselves (overview/demand/services/funnel/revenue/corporate/
 * advocates/ai/complaints) read bounded row sets and aggregate in Node (see that file's
 * original volume note: fine at this scale, move to SQL views as volume grows), so this layer
 * stays a thin, reusable "rows/count with a filter chain" pair rather than one function per
 * metric.
 */
import { getSupabase } from "../../config/db.js";

const ROW_CAP = 20000;

// Derived via typeof rather than imported -- see modules/admin/repository.ts's FilterBuilder
// comment for why (no generated DB types yet, per access.ts).
type FilterBuilder = ReturnType<ReturnType<ReturnType<typeof getSupabase>["from"]>["select"]>;

export async function rows<T = Record<string, unknown>>(table: string, columns: string, apply: (q: FilterBuilder) => FilterBuilder = (q) => q): Promise<T[]> {
  const { data, error } = await apply(getSupabase().from(table).select(columns)).limit(ROW_CAP);
  if (error) throw error;
  return data as T[];
}

export async function count(table: string, apply: (q: FilterBuilder) => FilterBuilder = (q) => q): Promise<number> {
  const { count: n, error } = await apply(getSupabase().from(table).select("*", { count: "exact", head: true }));
  if (error) throw error;
  return n || 0;
}
