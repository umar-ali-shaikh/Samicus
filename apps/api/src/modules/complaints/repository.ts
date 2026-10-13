/**
 * DB access for the complaints domain. Ported from routes/complaints.js's inline Supabase
 * calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

export interface ComplaintInsert {
  ref: string;
  title: string;
  description: string;
  category: string;
  serviceInvolved?: string;
  linkedRecordType?: string;
  linkedRecordId?: string;
  raisedBy: string;
}

export async function insertComplaint(input: ComplaintInsert): Promise<{ id: string; ref: string; status: string }> {
  const { data, error } = await getSupabase()
    .from("complaints")
    .insert({
      ref: input.ref,
      title: input.title,
      description: input.description,
      category: input.category,
      service_involved: input.serviceInvolved ?? null,
      linked_record_type: input.linkedRecordType ?? null,
      linked_record_id: input.linkedRecordId ?? null,
      raised_by: input.raisedBy,
    })
    .select("id, ref, status")
    .single();
  if (error) throw error;
  return data as { id: string; ref: string; status: string };
}

export interface MyComplaintRow {
  id: string;
  ref: string;
  title: string | null;
  category: string | null;
  status: string;
  created_at: string;
  corrective_action: string | null;
}

export async function listMyComplaints(userId: string): Promise<MyComplaintRow[]> {
  const { data, error } = await getSupabase()
    .from("complaints")
    .select("id, ref, title, category, status, created_at, corrective_action")
    .eq("raised_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MyComplaintRow[];
}

export interface ComplaintRow extends MyComplaintRow {
  description: string | null;
  severity: string;
  owner: string | null;
  root_cause: string | null;
  service_involved: string | null;
  refund_amount: number | null;
}

export async function updateComplaint(id: string, patch: Record<string, unknown>): Promise<ComplaintRow | null> {
  const { data, error } = await getSupabase().from("complaints").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data as ComplaintRow | null;
}
