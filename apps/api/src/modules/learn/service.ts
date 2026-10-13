/**
 * Business logic for the ask-&-learn domain. Ported from routes/askLearn.js -- same
 * behaviour, including the anonymous-to-readers question flow (the author's account is stored
 * only for moderation, never selected back) and the verified-advocate-only answer gate.
 */
import { logAudit } from "../../platform/audit.js";
import { HttpError, assertAccountMember, defaultAccountId } from "../../services/access.js";
import type {
  AnswerQuestionInput,
  AskQuestionInput,
  CreateGuideInput,
  CreatedAnswerDto,
  CreatedQuestionDto,
  GuideDetailDto,
  GuideListItemDto,
  ModerationDecisionInput,
  ModerationQueueDto,
  MyQuestionDto,
  PublicQuestionDto,
  SpecialisationDto,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

export async function listSpecialisations(): Promise<SpecialisationDto[]> {
  const [areas, counts] = await Promise.all([repo.listPracticeAreas(), repo.countAdvocatesByPracticeArea()]);
  return areas.map((a) => ({ ...a, advocateCount: counts.get(a.id) || 0 }));
}

export async function askQuestion(user: { id: string }, input: AskQuestionInput): Promise<CreatedQuestionDto> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  await assertAccountMember(user.id, accountId);
  const question = await repo.insertQuestion({ authorAccountId: accountId as string, body: input.body, practiceArea: input.practiceArea, city: input.city });
  return question as CreatedQuestionDto;
}

export async function listPublishedQuestions(filters: { area?: string; q?: string }): Promise<PublicQuestionDto[]> {
  return (await repo.listPublishedQuestions(filters)) as unknown as PublicQuestionDto[];
}

export async function listMyQuestions(user: { id: string }): Promise<MyQuestionDto[]> {
  const accountId = await defaultAccountId(user.id);
  if (!accountId) return [];
  return (await repo.listMyQuestions(accountId)) as MyQuestionDto[];
}

export async function answerQuestion(user: { id: string }, questionId: string, input: AnswerQuestionInput): Promise<CreatedAnswerDto> {
  const advocate = await repo.getVerifiedAdvocateByUserId(user.id);
  if (!advocate) throw new HttpError(403, "Only verified advocates may answer");
  const question = await repo.getPublishedQuestionById(questionId);
  if (!question) throw new HttpError(404, "Question not found.");
  return (await repo.insertAnswer(question.id, advocate.id, input.body)) as CreatedAnswerDto;
}

export async function markAnswerHelpful(answerId: string): Promise<unknown> {
  return repo.incrementHelpfulCount(answerId);
}

function toGuideListItem(row: repo.GuideListRow): GuideListItemDto {
  return { id: row.id, tag: row.tag, title: row.title, locale: row.locale, read_minutes: row.read_minutes, reviewed_at: row.reviewed_at };
}

export async function listGuides(): Promise<GuideListItemDto[]> {
  return (await repo.listGuides()).map(toGuideListItem);
}

export async function getGuide(id: string): Promise<GuideDetailDto> {
  const guide = await repo.getGuideById(id);
  if (!guide) throw new HttpError(404, "Not found");
  return { ...toGuideListItem(guide), body: guide.body };
}

export async function createGuide(input: CreateGuideInput): Promise<GuideDetailDto> {
  try {
    const guide = await repo.insertGuide(input);
    return { ...toGuideListItem(guide), body: guide.body };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "A guide with that title already exists.");
    throw err;
  }
}

export async function deleteGuide(id: string): Promise<void> {
  await repo.deleteGuide(id);
}

export async function getModerationQueue(): Promise<ModerationQueueDto> {
  return repo.listModerationQueue();
}

export async function decideModeration(user: { id: string }, type: "question" | "answer", id: string, input: ModerationDecisionInput): Promise<{ ok: true }> {
  const result = type === "question" ? await repo.decideQuestionModeration(id, input.decision) : await repo.decideAnswerModeration(id, input.decision);
  if (!result) throw new HttpError(404, "Not found");
  await logAudit({ actorId: user.id, actorRole: "admin", action: `moderation_${input.decision}`, subjectType: type, subjectId: id });
  return { ok: true };
}
