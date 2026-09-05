import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { PaymentStatus, type CurrencyCode } from "@fixitnow/types";

export interface PaymentDoc {
  intervention: Types.ObjectId;
  customer: Types.ObjectId;
  professional: Types.ObjectId;
  status: PaymentStatus;
  amountCents: number;
  platformFeeCents: number;
  professionalAmountCents: number;
  refundedAmountCents: number;
  currency: CurrencyCode;
  provider: string;
  providerPaymentId?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
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
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
      default: PaymentStatus.PENDING,
      index: true,
    },
    amountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFeeCents: {
      type: Number,
      required: true,
      min: 0,
    },
    professionalAmountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    refundedAmountCents: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    providerPaymentId: {
      type: String,
      trim: true,
      maxlength: 255,
      sparse: true,
      index: true,
    },
    paidAt: {
      type: Date,
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

paymentSchema.index({ intervention: 1, createdAt: -1 });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ professional: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

paymentSchema.pre("validate", function (next) {
  if (
    this.platformFeeCents + this.professionalAmountCents !==
    this.amountCents
  ) {
    return next(
      new Error(
        "platformFeeCents plus professionalAmountCents must equal amountCents."
      )
    );
  }

  if (this.refundedAmountCents > this.amountCents) {
    return next(new Error("refundedAmountCents cannot exceed amountCents."));
  }

  if (this.paidAt && this.paidAt < this.createdAt) {
    return next(new Error("paidAt cannot be earlier than createdAt."));
  }

  next();
});

export const Payment: Model<PaymentDoc> = model<PaymentDoc>(
  "Payment",
  paymentSchema
);
