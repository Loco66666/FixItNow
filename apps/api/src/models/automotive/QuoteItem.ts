import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface QuoteItemDoc {
  quote: Types.ObjectId;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  taxRate?: number;
  kind?: string;
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
    quantity: { type: Number, required: true, min: 0.01 },
    unitPriceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    // Per-item VAT rate (France metropolitan rate ladder), kept so the web
    // client can display a consistent line-level total inclusive of tax.
    taxRate: {
      type: Number,
      min: 0,
      max: 0.2,
    },
    kind: {
      type: String,
      enum: ["part", "labor", "service"],
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
