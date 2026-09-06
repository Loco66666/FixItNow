import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  conversationIdParamSchema,
  messageListQuerySchema,
  notificationIdParamSchema,
  sendMessageSchema,
} from "@fixitnow/types";
import {
  getConversationController,
  listConversationsController,
  listMessagesController,
  listNotificationsController,
  markNotificationReadController,
  sendMessageController,
} from "../controllers/conversations.controller";

const router = Router();

/** GET /conversations — all threads of the caller (customer or pro). */
router.get("/", requireAuth, listConversationsController);

/** POST /conversations/:conversationId/messages — send a text message. */
router.post(
  "/:conversationId/messages",
  requireAuth,
  rateLimit({ name: "conversations.send", max: 60, windowSec: 60 }),
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  sendMessageController
);

/** GET /conversations/:conversationId/messages — paginated history. */
router.get(
  "/:conversationId/messages",
  requireAuth,
  validate({
    params: conversationIdParamSchema,
    query: messageListQuerySchema,
  }),
  listMessagesController
);

/** GET /notifications — the caller's notifications. */
router.get("/notifications", requireAuth, listNotificationsController);

/** POST /notifications/:notificationId/read — mark one as read. */
router.post(
  "/notifications/:notificationId/read",
  requireAuth,
  validate({ params: notificationIdParamSchema }),
  markNotificationReadController
);

export default router;
