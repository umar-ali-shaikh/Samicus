/**
 * DB access for the ask-&-learn domain. Ported from routes/askLearn.js's inline Supabase
 * calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

export interface PracticeAreaRow {
  id: string;
  name: string;
  sub_specialisations: string[];
  typical_forums: string[];
  statute_tags: string[];
}

export async function listPracticeAreas(): Promise<PracticeAreaRow[]> {
  const { data, error } = await getSupabase().from("practice_areas").select("*").order("name");
  if (error) throw error;
  return data as PracticeAreaRow[];
}

export async function countAdvocatesByPracticeArea(): Promise<Map<string, number>> {
  const { data, error } = await getSupabase().rpc("advocate_counts_by_practice_area", {});
  if (error) throw error;
  return new Map((data as Array<{ practice_area_id: string; count: number }>).map((c) => [c.practice_area_id, Number(c.count)]));
}

export interface QuestionInsert {
  authorAccountId: string;
  body: string;
  practiceArea?: string;
  city?: string;
}

export async function insertQuestion(input: QuestionInsert): Promise<{ id: string; status: string }> {
  const { data, error } = await getSupabase()
    .from("public_questions")
    .insert({ author_account_id: input.authorAccountId, body: input.body, practice_area: input.practiceArea ?? null, city: input.city ?? null, status: "pending_moderation" })
    .select("id, status")
    .single();
  if (error) throw error;
  return data as { id: string; status: string };
}

export interface PublicQuestionRow {
  id: string;
  body: string;
  practice_area: string | null;
  city: string | null;
  status: string;
  view_count: number;
  created_at: string;
  answers: Array<{ id: string; body: string; helpful_count: number; published_at: string | null; advocate: { city: string | null; user: { full_name: string } | null } | null }>;
}

export async function listPublishedQuestions(filters: { area?: string; q?: string }): Promise<PublicQuestionRow[]> {
  // author_account_id is deliberately not selected -- never exposed on public reads.
  let query = getSupabase()
    .from("public_questions")
    .select("id, body, practice_area, city, status, view_count, created_at, answers:public_answers(id, body, helpful_count, published_at, advocate:advocates(city, user:users(full_name)))")
    .eq("status", "published")
    .eq("answers.moderation_state", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  if (filters.area) query = query.eq("practice_area", filters.area);
  if (filters.q) query = query.ilike("body", `%${filters.q.replace(/[%_]/g, "\\$&")}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as PublicQuestionRow[];
}

export interface MyQuestionRow {
  id: string;
  body: string;
  practice_area: string | null;
  status: string;
  created_at: string;
}

export async function listMyQuestions(accountId: string): Promise<MyQuestionRow[]> {
  const { data, error } = await getSupabase().from("public_questions").select("id, body, practice_area, status, created_at").eq("author_account_id", accountId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as MyQuestionRow[];
}

export async function getPublishedQuestionById(id: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("public_questions").select("id").eq("id", id).eq("status", "published").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function getVerifiedAdvocateByUserId(userId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("advocates").select("id").eq("user_id", userId).eq("verification_status", "verified").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function insertAnswer(questionId: string, advocateId: string, body: string): Promise<{ id: string; moderation_state: string }> {
  const { data, error } = await getSupabase()
    .from("public_answers")
    .insert({ question_id: questionId, advocate_id: advocateId, body, moderation_state: "pending" })
    .select("id, moderation_state")
    .single();
  if (error) throw error;
  return data as { id: string; moderation_state: string };
}

export async function incrementHelpfulCount(answerId: string): Promise<unknown> {
  const { data, error } = await getSupabase().rpc("increment_helpful_count", { answer_id: answerId });
  if (error) throw error;
  return data;
}

export interface GuideListRow {
  id: string;
  tag: string | null;
  title: string;
  locale: string;
  read_minutes: number | null;
  reviewed_at: string | null;
}

export async function listGuides(): Promise<GuideListRow[]> {
  const { data, error } = await getSupabase().from("guides").select("id, tag, title, locale, read_minutes, reviewed_at").order("title");
  if (error) throw error;
  return data as GuideListRow[];
}

export interface GuideDetailRow extends GuideListRow {
  body: string | null;
}

export async function getGuideById(id: string): Promise<GuideDetailRow | null> {
  const { data, error } = await getSupabase().from("guides").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as GuideDetailRow | null;
}

export interface GuideInsert {
  tag?: string;
  title: string;
  body: string;
  locale: "en" | "hi";
  readMinutes?: number;
}

export async function insertGuide(input: GuideInsert): Promise<GuideDetailRow> {
  const { data, error } = await getSupabase()
    .from("guides")
    .insert({ tag: input.tag ?? null, title: input.title, body: input.body, locale: input.locale, read_minutes: input.readMinutes ?? null, reviewed_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as GuideDetailRow;
}

export async function deleteGuide(id: string): Promise<void> {
  const { error } = await getSupabase().from("guides").delete().eq("id", id);
  if (error) throw error;
}

export interface ModerationQuestionRow {
  id: string;
  body: string;
  practice_area: string | null;
  city: string | null;
  created_at: string;
}

export interface ModerationAnswerRow {
  id: string;
  body: string;
  created_at: string;
  question: { id: string; body: string } | null;
  advocate: { user: { full_name: string } | null } | null;
}

export async function listModerationQueue(): Promise<{ questions: ModerationQuestionRow[]; answers: ModerationAnswerRow[] }> {
  const supabase = getSupabase();
  const [questions, answers] = await Promise.all([
    supabase.from("public_questions").select("id, body, practice_area, city, created_at").eq("status", "pending_moderation").order("created_at"),
    supabase.from("public_answers").select("id, body, created_at, question:public_questions(id, body), advocate:advocates(user:users(full_name))").eq("moderation_state", "pending").order("created_at"),
  ]);
  if (questions.error) throw questions.error;
  if (answers.error) throw answers.error;
  return { questions: questions.data as unknown as ModerationQuestionRow[], answers: answers.data as unknown as ModerationAnswerRow[] };
}

export async function decideQuestionModeration(id: string, decision: "published" | "rejected"): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("public_questions").update({ status: decision }).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function decideAnswerModeration(id: string, decision: "published" | "rejected"): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase()
    .from("public_answers")
    .update({ moderation_state: decision, published_at: decision === "published" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}
