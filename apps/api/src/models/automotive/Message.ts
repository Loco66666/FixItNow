import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { MessageType } from "@fixitnow/types";

export interface MessageDoc {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  type: MessageType;
  content?: string;
  media?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDoc>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "AutomotiveConversation",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    media: {
      type: Schema.Types.ObjectId,
      ref: "Media",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        conversation: "conversationId",
        sender: "senderId",
        media: "mediaId",
      }),
    },
  }
);

messageSchema.index({
  conversation: 1,
  createdAt: 1,
});

messageSchema.index({
  sender: 1,
  createdAt: -1,
});

messageSchema.pre("validate", function (next) {
  const hasContent =
    typeof this.content === "string" && this.content.trim().length > 0;

  const hasMedia = Boolean(this.media);

  if (!hasContent && !hasMedia) {
    return next(new Error("A message must contain content or media."));
  }

  next();
});

export const Message: Model<MessageDoc> = model<MessageDoc>(
  "AutomotiveMessage",
  messageSchema
);
