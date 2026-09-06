import { z } from "zod";

/**
 * Shared Zod contracts for conversations, messages and notifications
 * (PHASE 08) — single source of truth so the wire contract cannot drift.
 */

/** Body when sending a text message in a conversation. */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message vide")
    .max(10000, "Message trop long"),
  type: z.enum(["TEXT", "FILE", "SYSTEM"]).optional(),
});

export const conversationIdParamSchema = z.object({
  conversationId: z.string().min(1),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional(),
});

/** Body to mark a conversation as read (all messages). */
export const markConversationReadSchema = z.object({
  readAt: z.string().optional(),
});

/** Body to create an in-app notification (internal/tests). */
export const createNotificationSchema = z.object({
  type: z.enum(["INTERVENTION", "MESSAGE", "PAYMENT", "QUOTE", "SYSTEM"]),
  title: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(5000),
});

/** Params for read/write on a single notification. */
export const notificationIdParamSchema = z.object({
  notificationId: z.string().min(1),
});

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});
