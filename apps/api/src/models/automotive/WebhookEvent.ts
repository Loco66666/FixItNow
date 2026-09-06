import { Schema, model, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

/**
 * Deduplication ledger for provider webhooks (PHASE 07). Providers redeliver
 * events at-least-once; the unique {provider, eventId} index makes processing
 * idempotent — a replayed event hits the unique key and is acked as no-op.
 */
export interface WebhookEventDoc {
  provider: string;
  eventId: string;
  type: string;
  payload?: unknown;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<WebhookEventDoc>(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    payload: {
      type: Schema.Types.Mixed,
    },
    processedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({}),
    },
  }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEvent: Model<WebhookEventDoc> = model<WebhookEventDoc>(
  "WebhookEvent",
  webhookEventSchema
);
