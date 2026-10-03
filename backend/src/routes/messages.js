import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/threads", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: participantRows, error } = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("participant_id", req.user.id);
  if (error) throw error;

  const threadIds = participantRows.map((r) => r.thread_id);
  if (threadIds.length === 0) return res.json([]);

  const { data: threads, error: threadsError } = await supabase
    .from("message_threads")
    .select("*, matter:matters(*)")
    .in("id", threadIds);
  if (threadsError) throw threadsError;
  res.json(threads);
});

router.get("/threads/:id/messages", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from("messages")
    .select("*")
    .eq("thread_id", req.params.id)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  res.json(data);
});

router.post("/threads/:id/messages", requireAuth, async (req, res) => {
  const { body, attachments } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required" });
  const { data: message, error } = await getSupabase()
    .from("messages")
    .insert({ thread_id: req.params.id, sender_id: req.user.id, body, attachments: attachments || [] })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(message);
});

export default router;
