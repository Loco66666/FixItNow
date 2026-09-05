import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { QuoteStatus, type CurrencyCode } from "@fixitnow/types";

export interface QuoteDoc {
  intervention: Types.ObjectId;
  professional: Types.ObjectId;
  status: QuoteStatus;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: CurrencyCode;
  validUntil?: Date;
  notes?: string;
  items: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const quoteSchema = new Schema<QuoteDoc>(
  {
    intervention: {
      type: Schema.Types.ObjectId,
      ref: "Intervention",
      required: true,
      index: true,
    },
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(QuoteStatus),
      required: true,
      default: QuoteStatus.DRAFT,
      index: true,
    },
    subtotalCents: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    validUntil: {
      type: Date,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    items: {
      type: [Schema.Types.ObjectId],
      ref: "QuoteItem",
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        intervention: "interventionId",
        professional: "professionalId",
        items: "items",
      }),
    },
  }
);

quoteSchema.index({ intervention: 1, createdAt: -1 });
quoteSchema.index({ professional: 1, createdAt: -1 });
quoteSchema.index({ status: 1, validUntil: 1 });

quoteSchema.pre("validate", function (next) {
  if (this.totalAmountCents !== this.subtotalCents + this.taxAmountCents) {
    return next(
      new Error(
        "totalAmountCents must equal subtotalCents plus taxAmountCents."
      )
    );
  }

  if (this.validUntil && this.validUntil <= this.createdAt) {
    return next(new Error("validUntil must be later than createdAt."));
  }

  next();
});

export const Quote: Model<QuoteDoc> = model<QuoteDoc>("Quote", quoteSchema);
