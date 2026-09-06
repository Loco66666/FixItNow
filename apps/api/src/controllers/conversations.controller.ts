import type { NextFunction, Request, Response } from "express";
import {
  getOrCreateConversation,
  listMessages,
  listMyConversations,
  sendMessage,
} from "../services/conversation.service";
import {
  listNotifications,
  markNotificationRead,
} from "../services/notification.service";

/**
 * GET /interventions/:id/conversation
 *
 * Get (or lazily create) the 1:1 conversation thread of an intervention.
 * Participant-only (owner customer or assigned provider).
 */
export async function getConversationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const conversation = await getOrCreateConversation(
      req.params.id,
      req.auth.userId
    );
    res.json({ data: conversation });
  } catch (error) {
    next(error);
  }
}

/** GET /conversations — every conversation the caller participates in. */
export async function listConversationsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const conversations = await listMyConversations(req.auth.userId);
    res.json({ data: conversations });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /conversations/:conversationId/messages
 *
 * List a conversation's messages (oldest first). Participant-only.
 */
export async function listMessagesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const messages = await listMessages({
      conversationId: req.params.conversationId,
      callerUserId: req.auth.userId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      before:
        typeof req.query.before === "string" ? req.query.before : undefined,
    });
    res.json({ data: messages });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /conversations/:conversationId/messages
 *
 * Send a text message. Participant-only; notifies the other side.
 */
export async function sendMessageController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const message = await sendMessage({
      conversationId: req.params.conversationId,
      senderUserId: req.auth.userId,
      content: req.body.content as string,
    });
    res.status(201).json({ data: message });
  } catch (error) {
    next(error);
  }
}

/** GET /notifications — the caller's notifications, newest first. */
export async function listNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const notifications = await listNotifications({
      userId: req.auth.userId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      unreadOnly: req.query.unreadOnly === "true",
    });
    res.json({ data: notifications });
  } catch (error) {
    next(error);
  }
}

/** POST /notifications/:notificationId/read — mark one as read (owner-only). */
export async function markNotificationReadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const notification = await markNotificationRead({
      notificationId: req.params.notificationId,
      userId: req.auth.userId,
    });
    res.json({ data: notification });
  } catch (error) {
    next(error);
  }
}
