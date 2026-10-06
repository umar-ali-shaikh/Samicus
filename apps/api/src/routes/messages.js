import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../services/access.js";

const router = Router();

async function assertParticipant(userId, threadId) {
  const { data, error } = await getSupabase()
    .from("thread_participants")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("participant_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Conversation not found.");
}

router.get("/threads", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: participantRows, error } = await supabase.from("thread_participants").select("thread_id").eq("participant_id", req.user.id);
  if (error) throw error;

  const threadIds = participantRows.map((r) => r.thread_id);
  if (threadIds.length === 0) return res.json([]);

  const [threads, people, messages] = await Promise.all([
    supabase.from("message_threads").select("id, matter_id, updated_at, matter:matters(title, reference)").in("id", threadIds),
    supabase.from("thread_participants").select("thread_id, participant_id").in("thread_id", threadIds),
    supabase.from("messages").select("thread_id, sender_id, body, sent_at, read_at").in("thread_id", threadIds).order("sent_at", { ascending: false }).limit(1000),
  ]);
  for (const r of [threads, people, messages]) if (r.error) throw r.error;

  const otherIds = [...new Set(people.data.map((p) => p.participant_id).filter((id) => id !== req.user.id))];
  const { data: users, error: usersError } = otherIds.length
    ? await supabase.from("users").select("id, full_name, avatar_url").in("id", otherIds)
    : { data: [], error: null };
  if (usersError) throw usersError;
  const userById = new Map(users.map((u) => [u.id, u]));

  const result = threads.data.map((t) => {
    const msgs = messages.data.filter((m) => m.thread_id === t.id);
    const counterparts = people.data.filter((p) => p.thread_id === t.id && p.participant_id !== req.user.id).map((p) => userById.get(p.participant_id)).filter(Boolean);
    return {
      id: t.id,
      matter: t.matter,
      counterparts,
      lastMessage: msgs[0] ? { body: msgs[0].body, sentAt: msgs[0].sent_at, mine: msgs[0].sender_id === req.user.id } : null,
      unread: msgs.filter((m) => m.sender_id !== req.user.id && !m.read_at).length,
    };
  });
  result.sort((a, b) => new Date(b.lastMessage?.sentAt || 0) - new Date(a.lastMessage?.sentAt || 0));
  res.json(result);
});

router.get("/threads/:id/messages", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await assertParticipant(req.user.id, req.params.id);
  const { data, error } = await supabase.from("messages").select("*").eq("thread_id", req.params.id).order("sent_at", { ascending: true }).limit(500);
  if (error) throw error;

  // Opening the conversation marks the other side's messages as read.
  const { error: readError } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", req.params.id)
    .neq("sender_id", req.user.id)
    .is("read_at", null);
  if (readError) throw readError;

  res.json(data.map((m) => ({ ...m, mine: m.sender_id === req.user.id })));
});

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You're sending messages too quickly." },
});

router.post("/threads/:id/messages", requireAuth, sendLimiter, async (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) throw new HttpError(400, "Message body is required");
  if (body.length > 5000) throw new HttpError(400, "Message is too long (5,000 characters max).");
  await assertParticipant(req.user.id, req.params.id);

  const { data: message, error } = await getSupabase()
    .from("messages")
    .insert({ thread_id: req.params.id, sender_id: req.user.id, body })
    .select()
    .single();
  if (error) throw error;
  await getSupabase().from("message_threads").update({ updated_at: new Date().toISOString() }).eq("id", req.params.id);
  res.status(201).json({ ...message, mine: true });
});

export default router;
