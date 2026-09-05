import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { VerificationDocumentStatus } from "@fixitnow/types";

export interface VerificationDocumentDoc {
  professional: Types.ObjectId;
  type: string;
  status: VerificationDocumentStatus;
  file?: Types.ObjectId;
  rejectionReason?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationDocumentSchema = new Schema<VerificationDocumentDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(VerificationDocumentStatus),
      required: true,
      default: VerificationDocumentStatus.PENDING,
      index: true,
    },
    file: {
      type: Schema.Types.ObjectId,
      ref: "Media",
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        professional: "professionalId",
        file: "fileId",
      }),
    },
  }
);

verificationDocumentSchema.index({
  professional: 1,
  status: 1,
  createdAt: -1,
});

verificationDocumentSchema.index({
  professional: 1,
  type: 1,
  createdAt: -1,
});

verificationDocumentSchema.index({
  status: 1,
  expiresAt: 1,
});

verificationDocumentSchema.pre("validate", function (next) {
  if (this.expiresAt && this.expiresAt <= this.createdAt) {
    return next(new Error("expiresAt must be later than createdAt."));
  }

  if (
    this.status === VerificationDocumentStatus.REJECTED &&
    !this.rejectionReason?.trim()
  ) {
    return next(
      new Error("A rejected verification document must have a rejectionReason.")
    );
  }

  next();
});

export const VerificationDocument: Model<VerificationDocumentDoc> =
  model<VerificationDocumentDoc>(
    "VerificationDocument",
    verificationDocumentSchema
  );
