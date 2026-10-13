/**
 * DB access for the fixed-fee services domain. Ported from routes/services.js's inline
 * Supabase calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

export interface ServiceRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  professional_fee: number;
  government_fee: number;
  timeline_days: number | null;
  includes: string[];
  required_documents: string[];
  deliverables: string[];
}

export async function listServices(): Promise<ServiceRow[]> {
  const { data, error } = await getSupabase().from("services").select("*").order("category").order("name");
  if (error) throw error;
  return data as ServiceRow[];
}

export async function getServiceById(id: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("services").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export interface ServiceRowInsert {
  category: string;
  name: string;
  description: string | null;
  professional_fee: number;
  government_fee: number;
  timeline_days: number | null;
  includes: string[];
  required_documents: string[];
  deliverables: string[];
}

export async function insertService(row: ServiceRowInsert): Promise<ServiceRow> {
  const { data, error } = await getSupabase().from("services").insert(row).select().single();
  if (error) throw error;
  return data as ServiceRow;
}

export async function updateService(id: string, row: ServiceRowInsert): Promise<ServiceRow | null> {
  const { data, error } = await getSupabase().from("services").update(row).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data as ServiceRow | null;
}

export async function countOrdersForService(serviceId: string): Promise<number> {
  const { count, error } = await getSupabase().from("service_orders").select("*", { count: "exact", head: true }).eq("service_id", serviceId);
  if (error) throw error;
  return count || 0;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await getSupabase().from("services").delete().eq("id", id);
  if (error) throw error;
}

export interface OrderInsert {
  serviceId: string;
  accountId: string;
  notes: string | null;
}

export interface OrderRow {
  id: string;
  service_id: string;
  account_id: string;
  status: "started" | "in_progress" | "delivered" | "abandoned";
  matter_id: string | null;
  paid_at: string | null;
  advocate_id: string | null;
  notes: string | null;
  created_at: string;
}

export async function insertOrder(input: OrderInsert): Promise<OrderRow> {
  const { data, error } = await getSupabase().from("service_orders").insert({ service_id: input.serviceId, account_id: input.accountId, status: "started", notes: input.notes }).select().single();
  if (error) throw error;
  return data as OrderRow;
}

export interface OrderWithServiceRow extends OrderRow {
  service: { name: string; category: string; professional_fee: number; government_fee: number } | null;
}

export async function listOrdersForAccounts(accountIds: string[]): Promise<OrderWithServiceRow[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("service_orders")
    .select("*, service:services(name, category, professional_fee, government_fee)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as OrderWithServiceRow[];
}

export interface AdminOrderRow extends OrderRow {
  service: { name: string; category: string } | null;
  account: { display_name: string } | null;
  advocate: { id: string; user: { full_name: string } | null } | null;
}

export async function listAllOrdersForAdmin(): Promise<AdminOrderRow[]> {
  const { data, error } = await getSupabase()
    .from("service_orders")
    .select("*, service:services(name, category), account:accounts(display_name), advocate:advocates(id, user:users(full_name))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as unknown as AdminOrderRow[];
}

export async function getVerifiedAdvocate(advocateId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("advocates").select("id").eq("id", advocateId).eq("verification_status", "verified").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function assignOrder(orderId: string, advocateId: string): Promise<OrderRow | null> {
  const { data, error } = await getSupabase().from("service_orders").update({ advocate_id: advocateId, status: "in_progress" }).eq("id", orderId).select().maybeSingle();
  if (error) throw error;
  return data as OrderRow | null;
}
