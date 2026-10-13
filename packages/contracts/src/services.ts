/**
 * Fixed-fee services domain contracts. Ported from routes/services.js's inline serviceSchema
 * and its handlers' response shapes.
 */
import { z } from "zod";

export const SERVICE_ORDER_STATUSES = ["started", "in_progress", "delivered", "abandoned"] as const;

export const createServiceSchema = z.object({
  category: z.string().trim().min(2).max(60),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  professionalFee: z.number().min(0),
  governmentFee: z.number().min(0).default(0),
  timelineDays: z.number().int().min(1).max(365).optional(),
  includes: z.array(z.string().trim().max(160)).max(12).default([]),
  requiredDocuments: z.array(z.string().trim().max(160)).max(12).default([]),
  deliverables: z.array(z.string().trim().max(160)).max(12).default([]),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const createServiceOrderSchema = z.object({ accountId: z.string().uuid().optional(), notes: z.string().trim().max(2000).optional() });
export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

export const assignServiceOrderSchema = z.object({ advocateId: z.string().uuid() });
export type AssignServiceOrderInput = z.infer<typeof assignServiceOrderSchema>;

const serviceFeesDto = z.object({ professionalFee: z.number(), platformFee: z.number(), gst: z.number(), total: z.number() }).strict();

export const serviceRowDto = z
  .object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    professional_fee: z.number(),
    government_fee: z.number(),
    timeline_days: z.number().nullable(),
    includes: z.array(z.string()),
    required_documents: z.array(z.string()),
    deliverables: z.array(z.string()),
  })
  .strict();
export type ServiceRowDto = z.infer<typeof serviceRowDto>;

export const serviceListItemDto = z
  .object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    professional_fee: z.number(),
    government_fee: z.number(),
    timeline_days: z.number().nullable(),
    includes: z.array(z.string()),
    required_documents: z.array(z.string()),
    deliverables: z.array(z.string()),
    fees: serviceFeesDto,
    gov: z.number(),
  })
  .strict();
export type ServiceListItemDto = z.infer<typeof serviceListItemDto>;

export const serviceOrderRowDto = z
  .object({
    id: z.string(),
    service_id: z.string(),
    account_id: z.string(),
    status: z.enum(SERVICE_ORDER_STATUSES),
    matter_id: z.string().nullable(),
    paid_at: z.string().nullable(),
    advocate_id: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type ServiceOrderRowDto = z.infer<typeof serviceOrderRowDto>;

export const serviceOrderDto = z
  .object({
    id: z.string(),
    service_id: z.string(),
    account_id: z.string(),
    status: z.enum(SERVICE_ORDER_STATUSES),
    matter_id: z.string().nullable(),
    paid_at: z.string().nullable(),
    advocate_id: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    service: z.object({ name: z.string(), category: z.string(), professional_fee: z.number(), government_fee: z.number() }).strict().nullable(),
  })
  .strict();
export type ServiceOrderDto = z.infer<typeof serviceOrderDto>;

export const adminServiceOrderDto = z
  .object({
    id: z.string(),
    status: z.enum(SERVICE_ORDER_STATUSES),
    paid_at: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    service: z.object({ name: z.string(), category: z.string() }).strict().nullable(),
    account: z.object({ display_name: z.string() }).strict().nullable(),
    advocate: z.object({ id: z.string(), user: z.object({ full_name: z.string() }).strict().nullable() }).strict().nullable(),
  })
  .strict();
export type AdminServiceOrderDto = z.infer<typeof adminServiceOrderDto>;
