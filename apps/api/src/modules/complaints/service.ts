/**
 * Business logic for the complaints domain. Ported from routes/complaints.js -- same
 * behaviour, including the CMP-<year>-<5digits> reference format.
 */
import crypto from "crypto";
import { HttpError } from "../../services/access.js";
import type { ComplaintDto, CreateComplaintInput, CreatedComplaintDto, MyComplaintDto, UpdateComplaintInput } from "@vidhira/contracts";
import * as repo from "./repository.js";

export async function createComplaint(user: { id: string }, input: CreateComplaintInput): Promise<CreatedComplaintDto> {
  const ref = `CMP-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;
  return (await repo.insertComplaint({
    ref,
    title: input.title,
    description: input.description,
    category: input.category,
    serviceInvolved: input.serviceInvolved,
    linkedRecordType: input.linkedRecordType,
    linkedRecordId: input.linkedRecordId,
    raisedBy: user.id,
  })) as CreatedComplaintDto;
}

export async function listMyComplaints(user: { id: string }): Promise<MyComplaintDto[]> {
  return (await repo.listMyComplaints(user.id)) as MyComplaintDto[];
}

const PATCH_COLUMNS: Record<keyof UpdateComplaintInput, string> = {
  status: "status",
  severity: "severity",
  owner: "owner",
  rootCause: "root_cause",
  correctiveAction: "corrective_action",
  refundAmount: "refund_amount",
};

export async function updateComplaint(id: string, input: UpdateComplaintInput): Promise<ComplaintDto> {
  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as Array<[keyof UpdateComplaintInput, string]>) {
    if (input[key] !== undefined) patch[column] = input[key];
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");
  const updated = await repo.updateComplaint(id, patch);
  if (!updated) throw new HttpError(404, "Not found");
  return {
    id: updated.id,
    ref: updated.ref,
    title: updated.title,
    category: updated.category as ComplaintDto["category"],
    status: updated.status as ComplaintDto["status"],
    created_at: updated.created_at,
    corrective_action: updated.corrective_action,
    description: updated.description,
    severity: updated.severity as ComplaintDto["severity"],
    owner: updated.owner,
    root_cause: updated.root_cause,
    service_involved: updated.service_involved,
    refund_amount: updated.refund_amount,
  };
}
