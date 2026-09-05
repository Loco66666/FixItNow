import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface ConversationDoc {
  intervention: Types.ObjectId;
  customer: Types.ObjectId;
  professional: Types.ObjectId;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDoc>(
  {
    intervention: {
      type: Schema.Types.ObjectId,
      ref: "Intervention",
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        intervention: "interventionId",
        customer: "customerId",
        professional: "professionalId",
      }),
    },
  }
);

conversationSchema.index(
  {
    intervention: 1,
  },
  {
    unique: true,
    name: "intervention_unique",
  }
);

conversationSchema.index({
  customer: 1,
  lastMessageAt: -1,
});

conversationSchema.index({
  professional: 1,
  lastMessageAt: -1,
});

export const Conversation: Model<ConversationDoc> = model<ConversationDoc>(
  "AutomotiveConversation",
  conversationSchema
);
