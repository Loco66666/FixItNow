import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { CurrencyCode, InterventionOfferStatus } from "@fixitnow/types";

export interface InterventionOfferDoc {
  intervention: Types.ObjectId;
  professional: Types.ObjectId;
  status: InterventionOfferStatus;
  offeredAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
  estimatedArrivalAt?: Date;
  estimatedPayoutCents: number;
  currency: CurrencyCode;
  createdAt: Date;
  updatedAt: Date;
}

const interventionOfferSchema = new Schema<InterventionOfferDoc>(
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
      enum: Object.values(InterventionOfferStatus),
      required: true,
      default: InterventionOfferStatus.PENDING,
      index: true,
    },
    offeredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    respondedAt: {
      type: Date,
    },
    estimatedArrivalAt: {
      type: Date,
    },
    estimatedPayoutCents: {
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
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        intervention: "interventionId",
        professional: "professionalId",
      }),
    },
  }
);

interventionOfferSchema.index({
  intervention: 1,
  status: 1,
  expiresAt: 1,
});

interventionOfferSchema.index({
  professional: 1,
  status: 1,
  offeredAt: -1,
});

interventionOfferSchema.index(
  {
    intervention: 1,
    professional: 1,
  },
  {
    unique: true,
    name: "intervention_professional_unique",
  }
);

interventionOfferSchema.pre("validate", function (next) {
  if (this.expiresAt <= this.offeredAt) {
    return next(new Error("expiresAt must be later than offeredAt."));
  }

  if (this.respondedAt && this.respondedAt < this.offeredAt) {
    return next(new Error("respondedAt cannot be earlier than offeredAt."));
  }

  next();
});

export const InterventionOffer: Model<InterventionOfferDoc> =
  model<InterventionOfferDoc>("InterventionOffer", interventionOfferSchema);
