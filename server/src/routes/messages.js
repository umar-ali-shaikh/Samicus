import { Router } from "express";
import { MessageThread, Message } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/threads", requireAuth, async (req, res) => {
  const threads = await MessageThread.find({ participants: req.user._id }).populate("matterId");
  res.json(threads);
});

router.get("/threads/:id/messages", requireAuth, async (req, res) => {
  res.json(await Message.find({ threadId: req.params.id }).sort({ sentAt: 1 }));
});

router.post("/threads/:id/messages", requireAuth, async (req, res) => {
  const { body, attachments } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required" });
  const message = await Message.create({ threadId: req.params.id, senderId: req.user._id, body, attachments: attachments || [] });
  res.status(201).json(message);
});

export default router;
