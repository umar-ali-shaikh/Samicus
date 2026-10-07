/**
 * Messages domain contracts. Ported from apps/api/src/routes/messages.js's inline validation
 * and its handlers' response shapes (GET /threads' per-thread summary, GET/POST
 * /threads/:id/messages' `mine` flag).
 */
import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message body is required").max(5000, "Message is too long (5,000 characters max)."),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

const threadParticipantSummaryDto = z.object({ id: z.string(), full_name: z.string(), avatar_url: z.string().nullable() }).strict();

export const threadListItemDto = z
  .object({
    id: z.string(),
    matter: z.object({ title: z.string(), reference: z.string() }).strict().nullable(),
    counterparts: z.array(threadParticipantSummaryDto),
    lastMessage: z.object({ body: z.string(), sentAt: z.string(), mine: z.boolean() }).strict().nullable(),
    unread: z.number(),
  })
  .strict();
export type ThreadListItemDto = z.infer<typeof threadListItemDto>;

export const messageDto = z
  .object({
    id: z.string(),
    thread_id: z.string(),
    sender_id: z.string(),
    body: z.string(),
    attachments: z.array(z.string()),
    sent_at: z.string(),
    read_at: z.string().nullable(),
    mine: z.boolean(),
  })
  .strict();
export type MessageDto = z.infer<typeof messageDto>;
