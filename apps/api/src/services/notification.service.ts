import { Types } from "mongoose";
import type { NotificationType } from "@fixitnow/types";

import {
  Notification,
  type NotificationDoc,
} from "../models/automotive/Notification";
import { AppError } from "../utils/AppError";

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid id");
  }
  return new Types.ObjectId(value);
}

export function serializeNotification(n: NotificationDoc) {
  return {
    notificationId: String(n._id),
    userId: String(n.user),
    type: n.type,
    title: n.title,
    message: n.message,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

/**
 * Create an in-app notification (best-effort helper — callers in the
 * lifecycle treat notification failures as non-fatal).
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}): Promise<void> {
  try {
    await Notification.create({
      user: toObjectId(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
    });
  } catch (err) {
    // Notifications are best-effort: never break the business flow.
    console.warn(
      { err: { message: (err as Error)?.message } },
      "notification create failed"
    );
  }
}

/** List the caller's notifications, newest first. */
export async function listNotifications(input: {
  userId: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<ReturnType<typeof serializeNotification>[]> {
  const filter: Record<string, unknown> = { user: toObjectId(input.userId) };
  if (input.unreadOnly) filter.readAt = null;

  const docs = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(input.limit ?? 50)
    .lean();
  return (docs as NotificationDoc[]).map(serializeNotification);
}

/** Mark one notification as read. Owner-only (403 otherwise). */
export async function markNotificationRead(input: {
  notificationId: string;
  userId: string;
}): Promise<ReturnType<typeof serializeNotification>> {
  const notification = await Notification.findOne({
    _id: toObjectId(input.notificationId),
  }).lean();
  if (!notification) {
    throw AppError.notFound("Notification");
  }
  if (String(notification.user) !== input.userId) {
    throw AppError.forbidden("Only the recipient can mark a notification read");
  }
  await Notification.updateOne(
    { _id: notification._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  const fresh = (await Notification.findById(notification._id).lean())!;
  return serializeNotification(fresh as NotificationDoc);
}
