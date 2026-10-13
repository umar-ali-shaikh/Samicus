/**
 * Business logic for the privacy domain. Ported from routes/privacy.js -- same behaviour,
 * including the statutory-retention block on deletion while matters are engaged, and
 * anonymise-in-place (rather than hard-delete) so rows other parties rely on keep their
 * integrity.
 */
import { HttpError, advocateForUser, memberAccountIds } from "../../services/access.js";
import { removeObject } from "../../services/storage.js";
import type { MyDataExportDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

export async function exportMyData(user: Record<string, unknown> & { id: string }): Promise<MyDataExportDto> {
  const accountIds = await memberAccountIds(user.id);
  const data = await repo.loadExportData(user.id, accountIds);
  return {
    exportedAt: new Date().toISOString(),
    user,
    memberships: data.memberships,
    requests: data.requests,
    consultations: data.consultations,
    matters: data.matters,
    documents: data.documents,
    publicQuestions: data.publicQuestions,
    complaints: data.complaints,
    payments: data.payments,
    aiAssistantHistory: data.aiAssistantHistory,
  };
}

export async function deleteMyAccount(user: { id: string; auth_id: string | null }): Promise<void> {
  const accountIds = await memberAccountIds(user.id);

  const activeAsClient = await repo.countActiveMattersForAccounts(accountIds);
  if (activeAsClient > 0) throw new HttpError(409, "Cannot delete account while matters are engaged. Statutory retention applies until they are closed.");

  const advocate = await advocateForUser(user.id);
  if (advocate) {
    const activeAsAdvocate = await repo.countActiveMattersForAdvocate(advocate.id);
    if (activeAsAdvocate > 0) throw new HttpError(409, "You still have open matters as an advocate.");
    await repo.takeAdvocateOffline(advocate.id);
  }

  // Delete files in accounts where this user is the only member.
  for (const accountId of accountIds) {
    const memberCount = await repo.countAccountMembers(accountId);
    if (memberCount !== 1) continue;
    const docs = await repo.listDocumentsForAccount(accountId);
    for (const d of docs) await removeObject(d.storage_key).catch(() => undefined);
    await repo.deleteDocumentsByIds(docs.map((d) => d.id));
  }

  await repo.anonymiseUser(user.id);
  await repo.removeAllAccountMemberships(user.id);
  if (user.auth_id) {
    const { error } = await repo.deleteAuthUser(user.auth_id);
    if (error) console.error("Failed to delete auth user:", error.message);
  }
}
