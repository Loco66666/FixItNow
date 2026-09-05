import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { VerificationStatus } from "@fixitnow/types";

export interface ProfessionalVerificationDoc {
  professional: Types.ObjectId;
  status: VerificationStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const professionalVerificationSchema = new Schema<ProfessionalVerificationDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(VerificationStatus),
      required: true,
      default: VerificationStatus.NOT_STARTED,
      index: true,
    },
    submittedAt: {
      type: Date,
      index: true,
    },
    reviewedAt: {
      type: Date,
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        professional: "professionalId",
        reviewedBy: "reviewedBy",
      }),
    },
  }
);

professionalVerificationSchema.index({
  status: 1,
  submittedAt: -1,
});

professionalVerificationSchema.index({
  status: 1,
  reviewedAt: -1,
});

professionalVerificationSchema.pre("validate", function (next) {
  if (this.reviewedAt && !this.reviewedBy) {
    return next(new Error("reviewedBy is required when reviewedAt is set."));
  }

  if (this.status === VerificationStatus.APPROVED) {
    if (!this.reviewedAt || !this.reviewedBy) {
      return next(
        new Error(
          "An approved verification must have reviewedAt and reviewedBy."
        )
      );
    }
  }

  if (
    this.status === VerificationStatus.REJECTED &&
    !this.rejectionReason?.trim()
  ) {
    return next(
      new Error("A rejected verification must have a rejectionReason.")
    );
  }

  if (
    this.reviewedAt &&
    this.submittedAt &&
    this.reviewedAt < this.submittedAt
  ) {
    return next(new Error("reviewedAt cannot be earlier than submittedAt."));
  }

  next();
});

export const ProfessionalVerification: Model<ProfessionalVerificationDoc> =
  model<ProfessionalVerificationDoc>(
    "ProfessionalVerification",
    professionalVerificationSchema
  );
