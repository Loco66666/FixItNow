import { Types } from "mongoose";
import {
  MessageType,
  NotificationType,
  type InterventionEvent,
} from "@fixitnow/types";

import { logger } from "../config/logger";
import {
  Conversation,
  type ConversationDoc,
} from "../models/automotive/Conversation";
import { Message, type MessageDoc } from "../models/automotive/Message";
import { Intervention } from "../models/automotive/Intervention";
import { Professional } from "../models/automotive/Professional";
import { AppError } from "../utils/AppError";
import { createNotification } from "./notification.service";
import { publishInterventionEvent } from "./intervention-events";

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid id");
  }
  return new Types.ObjectId(value);
}

export function serializeConversation(c: ConversationDoc) {
  return {
    conversationId: String(c._id),
    interventionId: String(c.intervention),
    customerId: String(c.customer),
    professionalId: String(c.professional),
    lastMessageAt: c.lastMessageAt ?? null,
    createdAt: c.createdAt,
  };
}

export function serializeMessage(m: MessageDoc) {
  return {
    messageId: String(m._id),
    conversationId: String(m.conversation),
    senderId: String(m.sender),
    type: m.type,
    content: m.content ?? null,
    mediaId: m.media ? String(m.media) : null,
    createdAt: m.createdAt,
  };
}

/**
 * Resolve whether the caller participates in an intervention (owner or
 * assigned provider). Returns the participant ids needed downstream.
 */
async function resolveParticipants(
  interventionId: string,
  callerUserId: string
): Promise<{
  customerId: string;
  professionalId: string;
  professionalUserId: string;
}> {
  const intervention = await Intervention.findOne({
    _id: toObjectId(interventionId),
  })
    .select("customer professional")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }

  const professionalRow = await Professional.findOne({
    user: toObjectId(callerUserId),
  })
    .select("_id")
    .lean();

  const isOwner = String(intervention.customer) === callerUserId;
  const isAssignedPro =
    !!professionalRow &&
    !!intervention.professional &&
    String(intervention.professional) === String(professionalRow._id);

  if (!isOwner && !isAssignedPro) {
    throw AppError.forbidden(
      "Only the customer or the assigned provider can access this conversation"
    );
  }

  // Messages/Notifications reference USER ids — resolve the pro's user.
  let professionalUserId = callerUserId;
  if (intervention.professional) {
    const proDoc = await Professional.findById(intervention.professional)
      .select("user")
      .lean();
    if (proDoc) professionalUserId = String(proDoc.user);
  }

  return {
    customerId: String(intervention.customer),
    professionalId: String(intervention.professional),
    professionalUserId,
  };
}

/**
 * Get (or lazily create) the 1:1 conversation of an intervention. Only the
 * customer or the assigned provider may access it.
 */
export async function getOrCreateConversation(
  interventionId: string,
  callerUserId: string
): Promise<ReturnType<typeof serializeConversation>> {
  const participants = await resolveParticipants(interventionId, callerUserId);

  let conversation: ConversationDoc | null = (await Conversation.findOne({
    intervention: toObjectId(interventionId),
  }).lean()) as unknown as ConversationDoc | null;

  if (!conversation) {
    try {
      conversation = (
        await Conversation.create({
          intervention: toObjectId(interventionId),
          customer: toObjectId(participants.customerId),
          professional: toObjectId(participants.professionalId),
        })
      ).toObject() as unknown as ConversationDoc;
    } catch (err) {
      // Unique index race: another request created it first — re-read.
      if ((err as { code?: number }).code === 11000) {
        conversation = (await Conversation.findOne({
          intervention: toObjectId(interventionId),
        }).lean()) as unknown as ConversationDoc;
      } else {
        throw err;
      }
    }
  }

  return serializeConversation(conversation as ConversationDoc);
}

/**
 * Send a text message in a conversation. Both participants may post; the
 * other side receives an in-app MESSAGE notification and an SSE event on the
 * intervention channel.
 */
export async function sendMessage(input: {
  conversationId: string;
  senderUserId: string;
  content: string;
}): Promise<ReturnType<typeof serializeMessage>> {
  const conversation = await Conversation.findOne({
    _id: toObjectId(input.conversationId),
  }).lean();
  if (!conversation) {
    throw AppError.notFound("Conversation");
  }

  // Only the two participants may post.
  const proDoc = await Professional.findById(conversation.professional)
    .select("user")
    .lean();
  const proUserId = proDoc ? String(proDoc.user) : null;
  const customerId = String(conversation.customer);
  if (input.senderUserId !== customerId && input.senderUserId !== proUserId) {
    throw AppError.forbidden(
      "Only conversation participants can send messages"
    );
  }

  const message = (
    await Message.create({
      conversation: conversation._id,
      sender: toObjectId(input.senderUserId),
      type: MessageType.TEXT,
      content: input.content,
    })
  ).toObject() as MessageDoc;

  const now = new Date();
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessageAt: now } }
  );

  // Notify the other participant (best-effort).
  const recipientUserId =
    input.senderUserId === customerId ? proUserId : customerId;
  if (recipientUserId) {
    try {
      await createNotification({
        userId: recipientUserId,
        type: NotificationType.MESSAGE,
        title: "Nouveau message",
        message: input.content.slice(0, 200),
      });
    } catch (err) {
      logger.warn(
        { err: { message: (err as Error)?.message } },
        "message notification failed"
      );
    }
  }

  // SSE fan-out on the intervention channel (best-effort).
  try {
    const event: InterventionEvent = {
      type: "intervention.status-changed",
      interventionId: String(conversation.intervention),
      data: {
        action: "message",
        conversationId: String(conversation._id),
        messageId: String(message._id),
        senderId: input.senderUserId,
        at: now.toISOString(),
      },
      emittedAt: now.toISOString(),
    };
    await publishInterventionEvent(event);
  } catch (err) {
    logger.warn(
      { err: { message: (err as Error)?.message } },
      "message SSE publish failed"
    );
  }

  return serializeMessage(message);
}

/** List a conversation's messages, oldest first, paginated (before-cursor). */
export async function listMessages(input: {
  conversationId: string;
  callerUserId: string;
  limit?: number;
  before?: string;
}): Promise<ReturnType<typeof serializeMessage>[]> {
  const conversation = await Conversation.findOne({
    _id: toObjectId(input.conversationId),
  }).lean();
  if (!conversation) {
    throw AppError.notFound("Conversation");
  }

  const proDoc = await Professional.findById(conversation.professional)
    .select("user")
    .lean();
  const proUserId = proDoc ? String(proDoc.user) : null;
  const customerId = String(conversation.customer);
  if (input.callerUserId !== customerId && input.callerUserId !== proUserId) {
    throw AppError.forbidden(
      "Only conversation participants can read messages"
    );
  }

  const filter: Record<string, unknown> = { conversation: conversation._id };
  if (input.before && Types.ObjectId.isValid(input.before)) {
    filter._id = { $lt: toObjectId(input.before) };
  }

  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(input.limit ?? 50)
    .lean();
  // Return oldest-first for a chat-like render.
  return (docs as MessageDoc[]).reverse().map(serializeMessage);
}

/** List every conversation the caller participates in (customer or pro). */
export async function listMyConversations(
  callerUserId: string
): Promise<ReturnType<typeof serializeConversation>[]> {
  const asCustomer = await Conversation.find({
    customer: toObjectId(callerUserId),
  })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  const proRow = await Professional.findOne({ user: toObjectId(callerUserId) })
    .select("_id")
    .lean();
  const asPro = proRow
    ? await Conversation.find({ professional: proRow._id })
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .lean()
    : [];

  const all = [...asCustomer, ...asPro] as ConversationDoc[];
  const unique = new Map<string, ConversationDoc>();
  for (const conv of all) unique.set(String(conv._id), conv);

  return [...unique.values()].map(serializeConversation);
}
