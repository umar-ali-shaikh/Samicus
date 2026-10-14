// Complaints triage data for the admin/founder "Complaints" view -- the only figure here still
// in use. Everything else this file once computed (overview/demand/services/funnel/revenue/
// corporate/advocates/ai) was ported to modules/founder/service.ts (same behaviour, same math,
// see that file's header comment) and is dead here: nothing outside this file imports them, and
// nothing inside it references them either (confirmed via a full-repo grep + a knip run before
// deleting them -- see docs/architecture/02-security-model.md's known-gaps section).
import { getSupabase } from "../../config/db.js";

const ROW_CAP = 20000;

const sb = () => getSupabase();

async function rows(table, columns, apply = (q) => q) {
  const { data, error } = await apply(sb().from(table).select(columns)).limit(ROW_CAP);
  if (error) throw error;
  return data;
}

export async function complaints() {
  const data = await rows("complaints", "id, ref, title, description, category, status, severity, service_involved, owner, root_cause, corrective_action, refund_amount, created_at");
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return {
    kpis: [
      { label: "Open", value: data.filter((c) => c.status === "open").length },
      { label: "Escalated", value: data.filter((c) => c.status === "escalated").length },
      { label: "Resolved", value: data.filter((c) => c.status === "resolved").length },
      { label: "High severity", value: data.filter((c) => c.severity === "high").length },
    ],
    complaints: data,
  };
}
