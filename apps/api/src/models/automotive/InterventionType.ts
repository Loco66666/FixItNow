import { Schema, model, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface InterventionTypeDoc {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const interventionTypeSchema = new Schema<InterventionTypeDoc>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: jsonTransform() },
  }
);

interventionTypeSchema.index({ slug: 1 }, { unique: true });
interventionTypeSchema.index({ isActive: 1, name: 1 });

export const InterventionType: Model<InterventionTypeDoc> =
  model<InterventionTypeDoc>("InterventionType", interventionTypeSchema);
