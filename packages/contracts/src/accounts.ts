/**
 * Accounts domain contracts -- request validation + response DTOs, shared by apps/api
 * (modules/accounts) and apps/web. Ported from apps/api/src/routes/accounts.js's inline
 * validation; same rules, same copy on error messages where the original had any.
 */
import { z } from "zod";

export const ACCOUNT_TYPES = ["individual", "family", "business"] as const;
export const CREATABLE_ACCOUNT_TYPES = ["family", "business"] as const;
export const MEMBER_ROLES = ["admin", "member", "finance", "viewer"] as const;
export const ACCOUNT_MEMBER_ROLES = ["owner", ...MEMBER_ROLES] as const;

export const createAccountSchema = z.object({
  type: z.enum(CREATABLE_ACCOUNT_TYPES),
  displayName: z.string().trim().min(2).max(120),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN")
    .optional(),
  cin: z.string().trim().max(30).optional(),
  billingAddress: z.string().trim().max(400).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email address is required."),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(MEMBER_ROLES, { message: "Invalid role." }).optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

// --- Response DTOs: .strict() so an accidental extra field in a mapper is a hard error,
// never a silent leak of an internal column. ---

export const accountDto = z
  .object({
    id: z.string(),
    type: z.enum(ACCOUNT_TYPES),
    display_name: z.string(),
    gstin: z.string().nullable(),
    cin: z.string().nullable(),
    billing_address: z.string().nullable(),
    seat_limit: z.number(),
    myRole: z.enum(ACCOUNT_MEMBER_ROLES),
  })
  .strict();
export type AccountDto = z.infer<typeof accountDto>;

export const memberUserDto = z
  .object({
    id: z.string(),
    full_name: z.string(),
    email: z.string().nullable(),
    avatar_url: z.string().nullable(),
  })
  .strict();

export const accountMemberDto = z
  .object({
    id: z.string(),
    role: z.enum(ACCOUNT_MEMBER_ROLES),
    invited_at: z.string().nullable(),
    accepted_at: z.string().nullable(),
    user: memberUserDto.nullable(),
  })
  .strict();
export type AccountMemberDto = z.infer<typeof accountMemberDto>;

export const planDto = z
  .object({
    id: z.string(),
    name: z.string(),
    audience: z.enum(ACCOUNT_TYPES),
    price_monthly: z.number(),
    entitlement_consultations: z.number().nullable(),
    entitlement_document_reviews: z.number().nullable(),
    entitlement_seats: z.number().nullable(),
  })
  .strict();
export type PlanDto = z.infer<typeof planDto>;
