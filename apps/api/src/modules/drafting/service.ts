/**
 * Business logic for the drafting domain. Ported from routes/drafting.js -- same behaviour,
 * including the 404-not-403 ownership check (loadOwnDraft) and the download-blocked-while-
 * required-fields-empty guard. The document-assembly engine stays in services/drafting.js and
 * its own test suite; the DOCX/PDF renderer stays in services/draftRender.js.
 */
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../../services/access.js";
import { assembleDraft, checkClauseGuards, missingRequiredFields } from "../../services/drafting.js";
import { renderDocx, renderPdf } from "../../services/draftRender.js";
import type {
  AdvocateDraftReviewDetailDto,
  AdvocateDraftReviewListItemDto,
  AssembledBlockDto,
  ClauseDto,
  CreateDraftInput,
  DocTemplateDetailDto,
  DocTemplateListItemDto,
  DocumentDraftDto,
  DraftListItemDto,
  DraftPreviewResultDto,
  DraftReviewDto,
  PatchDraftInput,
  RequestDraftReviewInput,
  ReturnDraftReviewInput,
} from "@vidhira/contracts";
import * as repo from "./repository.js";
import type { DraftRow, DraftWithTemplate } from "./repository.js";

async function loadOwnDraft(user: { id: string }, id: string): Promise<DraftRow> {
  const draft = await repo.getDraftById(id);
  if (!draft) throw new HttpError(404, "Not found");
  try {
    await assertAccountMember(user.id, draft.account_id);
  } catch {
    throw new HttpError(404, "Not found");
  }
  return draft;
}

function toDraftDto(row: DraftRow): DocumentDraftDto {
  return {
    id: row.id,
    account_id: row.account_id,
    template_id: row.template_id,
    template_version: row.template_version,
    field_values: row.field_values ?? {},
    selected_clause_ids: row.selected_clause_ids ?? [],
    custom_clauses: row.custom_clauses ?? [],
    status: row.status,
    review_id: row.review_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toReviewDto(row: repo.ReviewRow): DraftReviewDto {
  return {
    id: row.id,
    draft_id: row.draft_id,
    advocate_id: row.advocate_id,
    fee: row.fee,
    comments: row.comments ?? [],
    status: row.status,
    submitted_at: row.submitted_at,
    returned_at: row.returned_at,
  };
}

export async function listTemplates(): Promise<DocTemplateListItemDto[]> {
  return (await repo.listTemplates()).map((t) => ({
    id: t.id,
    category: t.category,
    name: t.name,
    jurisdiction: t.jurisdiction,
    blurb: t.blurb,
    pages: t.pages,
    draft_fee: t.draft_fee,
    review_fee: t.review_fee,
    version: t.version,
  }));
}

export async function getTemplateDetail(id: string): Promise<DocTemplateDetailDto> {
  const template = await repo.getTemplateById(id);
  if (!template) throw new HttpError(404, "Not found");
  const clauses = await repo.listClausesForTemplate(template.id);
  return {
    template: {
      id: template.id,
      category: template.category,
      name: template.name,
      jurisdiction: template.jurisdiction,
      blurb: template.blurb,
      pages: template.pages,
      draft_fee: template.draft_fee,
      review_fee: template.review_fee,
      version: template.version,
      base_sections: template.base_sections ?? [],
      field_schema: template.field_schema ?? [],
      stamp_duty_note: template.stamp_duty_note ?? null,
    },
    clauses: clauses.map(repo.toClauseDto) as ClauseDto[],
  };
}

export async function createDraft(user: { id: string }, input: CreateDraftInput): Promise<DocumentDraftDto> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  await assertAccountMember(user.id, accountId);
  const template = await repo.getActiveTemplateById(input.templateId);
  if (!template) throw new HttpError(404, "Template not found");
  const draft = await repo.insertDraft({ accountId: accountId as string, templateId: template.id, templateVersion: template.version, createdBy: user.id });
  return toDraftDto(draft);
}

export async function listMyDrafts(user: { id: string }): Promise<DraftListItemDto[]> {
  const accountIds = await memberAccountIds(user.id);
  if (accountIds.length === 0) return [];
  const rows = await repo.listDraftsForAccounts(accountIds);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    template: r.template ? { name: r.template.name, category: r.template.category } : null,
  }));
}

export async function getDraft(user: { id: string }, id: string): Promise<DocumentDraftDto> {
  return toDraftDto(await loadOwnDraft(user, id));
}

export async function patchDraft(user: { id: string }, id: string, input: PatchDraftInput): Promise<DocumentDraftDto> {
  const draft = await loadOwnDraft(user, id);
  const { fieldValues, selectedClauseIds, customClauses } = input;

  const patch: Record<string, unknown> = {};
  if (selectedClauseIds) {
    const clauseRows = await repo.listClausesByIds(selectedClauseIds);
    if (clauseRows.length !== selectedClauseIds.length) throw new HttpError(400, "Unknown clause for this template.");
    const errors = checkClauseGuards(selectedClauseIds, clauseRows.map(repo.toClauseShape), { ...draft.field_values, ...fieldValues });
    if (errors.length) throw new HttpError(422, errors.join(" "), { errors });
    patch.selected_clause_ids = selectedClauseIds;
  }
  if (fieldValues) patch.field_values = { ...draft.field_values, ...fieldValues };
  if (customClauses) patch.custom_clauses = customClauses;
  if (Object.keys(patch).length === 0) return toDraftDto(draft);

  return toDraftDto(await repo.patchDraft(draft.id, patch));
}

async function assemble(draftId: string): Promise<{ draft: DraftWithTemplate; assembled: { blocks: AssembledBlockDto[]; flaggedFields: string[] } }> {
  const draft = await repo.getDraftWithTemplate(draftId);
  let selectedClauses: ReturnType<typeof repo.toClauseShape>[] = [];
  if (draft.selected_clause_ids?.length) {
    const clauseRows = await repo.listClausesByIds(draft.selected_clause_ids);
    selectedClauses = clauseRows.map(repo.toClauseShape);
  }
  const assembled = assembleDraft({
    template: repo.toTemplateShape(draft.template),
    fieldValues: draft.field_values,
    selectedClauses,
    customClauses: draft.custom_clauses,
  }) as { blocks: AssembledBlockDto[]; flaggedFields: string[] };
  return { draft, assembled };
}

export async function preview(user: { id: string }, id: string): Promise<DraftPreviewResultDto> {
  await loadOwnDraft(user, id);
  const { draft, assembled } = await assemble(id);
  const missing = missingRequiredFields(draft.template.field_schema ?? [], draft.field_values);
  return { ...assembled, missingRequiredFields: missing };
}

export async function download(user: { id: string }, id: string, format: "pdf" | "docx"): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  await loadOwnDraft(user, id);
  const { draft, assembled } = await assemble(id);
  const missing = missingRequiredFields(draft.template.field_schema ?? [], draft.field_values);
  if (missing.length > 0) throw new HttpError(422, `Fill in the required fields before downloading: ${missing.join(", ")}.`);
  const title = draft.template.name;
  const buffer = format === "pdf" ? await renderPdf({ title, blocks: assembled.blocks }) : await renderDocx({ title, blocks: assembled.blocks });
  await repo.markDraftRenderedIfDraft(draft.id, draft.status);
  return {
    buffer: buffer as Buffer,
    filename: `${title.replace(/[^\w]+/g, "-")}-draft.${format}`,
    contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function requestReview(user: { id: string }, draftId: string, input: RequestDraftReviewInput): Promise<DraftReviewDto> {
  const draft = await loadOwnDraft(user, draftId);
  const template = await repo.getTemplateById(draft.template_id);
  if (!template) throw new HttpError(404, "Not found");
  const advocate = await repo.getVerifiedAdvocate(input.advocateId);
  if (!advocate) throw new HttpError(404, "Advocate not found");

  const review = await repo.insertDraftReview({ draftId: draft.id, advocateId: advocate.id, fee: template.review_fee });
  await repo.setDraftSentForReview(draft.id, review.id);
  return toReviewDto(review);
}

export async function getReview(user: { id: string }, draftId: string, reviewId: string): Promise<DraftReviewDto> {
  await loadOwnDraft(user, draftId);
  const review = await repo.getReviewForDraft(draftId, reviewId);
  if (!review) throw new HttpError(404, "Not found");
  return toReviewDto(review);
}

export async function listReviewsForAdvocate(advocate: { id: string } | null): Promise<AdvocateDraftReviewListItemDto[]> {
  if (!advocate) return [];
  const rows = await repo.listReviewsForAdvocate(advocate.id);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    fee: r.fee,
    submitted_at: r.submitted_at,
    draft: r.draft ? { id: r.draft.id, template: r.draft.template ? { name: r.draft.template.name } : null } : null,
  }));
}

export async function getReviewDetailForAdvocate(advocate: { id: string } | null, id: string): Promise<AdvocateDraftReviewDetailDto> {
  const review = advocate ? await repo.getReviewForAdvocate(id, advocate.id) : null;
  if (!review) throw new HttpError(404, "Not found");
  const { assembled } = await assemble(review.draft_id);
  return { review: toReviewDto(review), draft: assembled };
}

export async function returnReview(advocate: { id: string } | null, id: string, input: ReturnDraftReviewInput): Promise<DraftReviewDto> {
  if (!advocate) throw new HttpError(404, "Not found");
  const data = await repo.returnReview(id, advocate.id, input.comments);
  if (!data) throw new HttpError(404, "Not found");
  await repo.markDraftReviewed(data.draft_id);
  return toReviewDto(data);
}
