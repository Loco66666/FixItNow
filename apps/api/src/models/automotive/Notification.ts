import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { NotificationType } from "@fixitnow/types";

export interface NotificationDoc {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    readAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        user: "userId",
      }),
    },
  }
);

notificationSchema.index({
  user: 1,
  readAt: 1,
  createdAt: -1,
});

notificationSchema.index({
  user: 1,
  createdAt: -1,
});

notificationSchema.pre("validate", function (next) {
  if (this.readAt && this.readAt < this.createdAt) {
    return next(new Error("readAt cannot be earlier than createdAt."));
  }

  next();
});

export const Notification: Model<NotificationDoc> = model<NotificationDoc>(
  "AutomotiveNotification",
  notificationSchema
);
