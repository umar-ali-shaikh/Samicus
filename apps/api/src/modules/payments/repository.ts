/**
 * DB access for the payments domain. Ported from routes/payments.js's inline Supabase calls --
 * same queries, same behaviour. No generated DB types yet; rows are cast to local interfaces
 * matching what each query actually selects. Touches service_orders/draft_reviews tables
 * directly (those domains' own routers aren't converted yet) -- same precedent as matters
 * querying consultations, or documents querying matters.
 */
import { getSupabase } from "../../config/db.js";

export interface ConsultationPayableRow {
  id: string;
  account_id: string;
  fee_total: number;
  paid_at: string | null;
  state: string;
}

export async function findConsultationForPayment(id: string): Promise<ConsultationPayableRow | null> {
  const { data, error } = await getSupabase().from("consultations").select("id, account_id, fee_total, paid_at, state").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ConsultationPayableRow | null;
}

export interface InvoicePayableRow {
  id: string;
  total: number;
  status: string;
  matter: { account_id: string } | null;
}

export async function findInvoiceForPayment(id: string): Promise<InvoicePayableRow | null> {
  const { data, error } = await getSupabase().from("invoices").select("id, total, status, matter:matters(account_id)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as InvoicePayableRow | null;
}

export interface ServiceOrderPayableRow {
  id: string;
  account_id: string;
  paid_at: string | null;
  service: { professional_fee: number; government_fee: number } | null;
}

export async function findServiceOrderForPayment(id: string): Promise<ServiceOrderPayableRow | null> {
  const { data, error } = await getSupabase().from("service_orders").select("id, account_id, paid_at, service:services(professional_fee, government_fee)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as ServiceOrderPayableRow | null;
}

export interface DraftReviewPayableRow {
  id: string;
  fee: number;
  paid_at: string | null;
  draft: { account_id: string } | null;
}

export async function findDraftReviewForPayment(id: string): Promise<DraftReviewPayableRow | null> {
  const { data, error } = await getSupabase().from("draft_reviews").select("id, fee, paid_at, draft:document_drafts!draft_id(account_id)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as DraftReviewPayableRow | null;
}

export interface NewPaymentOrderInput {
  kind: string;
  subjectId: string;
  accountId: string;
  createdBy: string;
  amountPaise: number;
  providerOrderId: string;
}

export async function insertPaymentOrder(input: NewPaymentOrderInput): Promise<{ id: string; provider_order_id: string; amount_paise: number; currency: string }> {
  const { data, error } = await getSupabase()
    .from("payment_orders")
    .insert({ kind: input.kind, subject_id: input.subjectId, account_id: input.accountId, created_by: input.createdBy, amount_paise: input.amountPaise, provider_order_id: input.providerOrderId })
    .select("id, provider_order_id, amount_paise, currency")
    .single();
  if (error) throw error;
  return data as { id: string; provider_order_id: string; amount_paise: number; currency: string };
}

export interface PaymentOrderRow {
  id: string;
  kind: string;
  subject_id: string;
  account_id: string;
  created_by: string;
  amount_paise: number;
  currency: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  status: string;
  method: string | null;
  paid_at: string | null;
  created_at: string;
}

export async function findPaymentOrderByProviderOrderId(providerOrderId: string): Promise<PaymentOrderRow | null> {
  const { data, error } = await getSupabase().from("payment_orders").select("*").eq("provider_order_id", providerOrderId).maybeSingle();
  if (error) throw error;
  return data as PaymentOrderRow | null;
}

// Idempotent: the conditional `neq("status", "paid")` only lets one caller win per order.
export async function settlePaymentOrder(providerOrderId: string, providerPaymentId: string, method: string | null): Promise<PaymentOrderRow | null> {
  const { data, error } = await getSupabase()
    .from("payment_orders")
    .update({ status: "paid", provider_payment_id: providerPaymentId, method, paid_at: new Date().toISOString() })
    .eq("provider_order_id", providerOrderId)
    .neq("status", "paid")
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as PaymentOrderRow | null;
}

export async function markConsultationPaid(id: string, paidAt: string, method: string | null): Promise<void> {
  const { error } = await getSupabase().from("consultations").update({ paid_at: paidAt, payment_method: method }).eq("id", id);
  if (error) throw error;
}

export async function markServiceOrderPaid(id: string, paidAt: string): Promise<void> {
  const { error } = await getSupabase().from("service_orders").update({ paid_at: paidAt }).eq("id", id);
  if (error) throw error;
}

export async function markDraftReviewPaid(id: string, paidAt: string): Promise<void> {
  const { error } = await getSupabase().from("draft_reviews").update({ paid_at: paidAt }).eq("id", id);
  if (error) throw error;
}

// Payment row + invoice status as one transaction -- see capture_payment() in schema.sql.
export async function capturePayment(invoiceId: string, method: string, gatewayRef: string, escrowState: string): Promise<void> {
  const { error } = await getSupabase().rpc("capture_payment", { p_invoice_id: invoiceId, p_method: method, p_gateway_ref: gatewayRef, p_escrow_state: escrowState });
  if (error) throw error;
}

export async function listPaymentHistoryForUser(userId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase()
    .from("payment_orders")
    .select("id, kind, subject_id, amount_paise, currency, status, method, paid_at, created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Array<Record<string, unknown>>;
}
