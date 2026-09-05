import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface QuoteItemDoc {
  quote: Types.ObjectId;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const quoteItemSchema = new Schema<QuoteItemDoc>(
  {
    quote: {
      type: Schema.Types.ObjectId,
      ref: "Quote",
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unitPriceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCents: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        quote: "quoteId",
      }),
    },
  }
);

quoteItemSchema.index({ quote: 1, createdAt: 1 });

quoteItemSchema.pre("validate", function (next) {
  const expectedTotal = Math.round(this.quantity * this.unitPriceCents);

  if (this.totalCents !== expectedTotal) {
    return next(
      new Error("totalCents must equal quantity multiplied by unitPriceCents.")
    );
  }

  next();
});

export const QuoteItem: Model<QuoteItemDoc> = model<QuoteItemDoc>(
  "QuoteItem",
  quoteItemSchema
);
