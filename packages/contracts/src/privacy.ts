/**
 * Privacy domain contracts. Ported from routes/privacy.js's export/delete handlers. The export
 * is a data-subject disclosure dump (everything the platform holds about the caller, nothing
 * about anyone else) rather than a typed business entity, so its DTO is intentionally shaped
 * loosely around what each sub-query actually selects instead of full per-table strictness.
 */
import { z } from "zod";

export const myDataExportDto = z
  .object({
    exportedAt: z.string(),
    user: z.record(z.string(), z.unknown()),
    memberships: z.array(z.record(z.string(), z.unknown())),
    requests: z.array(z.record(z.string(), z.unknown())),
    consultations: z.array(z.record(z.string(), z.unknown())),
    matters: z.array(z.record(z.string(), z.unknown())),
    documents: z.array(z.record(z.string(), z.unknown())),
    publicQuestions: z.array(z.record(z.string(), z.unknown())),
    complaints: z.array(z.record(z.string(), z.unknown())),
    payments: z.array(z.record(z.string(), z.unknown())),
    aiAssistantHistory: z.array(z.record(z.string(), z.unknown())),
  })
  .strict();
export type MyDataExportDto = z.infer<typeof myDataExportDto>;
