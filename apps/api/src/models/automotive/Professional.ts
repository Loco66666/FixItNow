import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { ProfessionalType, VerificationStatus } from "@fixitnow/types";

export interface ProfessionalLocation {
  type: "Point";
  coordinates: [number, number];
}

export interface ProfessionalDoc {
  user: Types.ObjectId;
  type: ProfessionalType;
  displayName: string;
  phone?: string;
  description?: string;
  yearsExperience?: number;
  serviceRadiusKm: number;
  verificationStatus: VerificationStatus;
  location?: ProfessionalLocation;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const professionalSchema = new Schema<ProfessionalDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(ProfessionalType),
      required: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    yearsExperience: {
      type: Number,
      min: 0,
      max: 100,
    },
    serviceRadiusKm: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
      default: 30,
    },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      required: true,
      default: VerificationStatus.NOT_STARTED,
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (value: number[]) =>
            value.length === 2 &&
            value[0] >= -180 &&
            value[0] <= 180 &&
            value[1] >= -90 &&
            value[1] <= 90,
          message: "Location coordinates must be [longitude, latitude].",
        },
      },
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        user: "userId",
      }),
    },
  }
);

professionalSchema.index({ location: "2dsphere" });

professionalSchema.index({
  verificationStatus: 1,
  isActive: 1,
  type: 1,
});

export const Professional: Model<ProfessionalDoc> = model<ProfessionalDoc>(
  "Professional",
  professionalSchema
);
