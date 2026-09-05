import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { type CurrencyCode } from "@fixitnow/types";

export interface InvoiceDoc {
  intervention: Types.ObjectId;
  customer: Types.ObjectId;
  professional: Types.ObjectId;
  invoiceNumber: string;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: CurrencyCode;
  issuedAt: Date;
  dueAt?: Date;
  paidAt?: Date;
  pdfUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<InvoiceDoc>(
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
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      unique: true,
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
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    dueAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    pdfUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
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

invoiceSchema.index({ intervention: 1, createdAt: -1 });
invoiceSchema.index({ customer: 1, issuedAt: -1 });
invoiceSchema.index({ professional: 1, issuedAt: -1 });

invoiceSchema.pre("validate", function (next) {
  if (this.totalAmountCents !== this.subtotalCents + this.taxAmountCents) {
    return next(
      new Error(
        "totalAmountCents must equal subtotalCents plus taxAmountCents."
      )
    );
  }

  if (this.dueAt && this.dueAt < this.issuedAt) {
    return next(new Error("dueAt cannot be earlier than issuedAt."));
  }

  if (this.paidAt && this.paidAt < this.issuedAt) {
    return next(new Error("paidAt cannot be earlier than issuedAt."));
  }

  if (this.dueAt && this.paidAt && this.paidAt < this.dueAt) {
    return next(new Error("paidAt cannot be earlier than dueAt."));
  }

  next();
});

export const Invoice: Model<InvoiceDoc> = model<InvoiceDoc>(
  "Invoice",
  invoiceSchema
);
