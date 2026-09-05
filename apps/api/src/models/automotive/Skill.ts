import { Schema, model, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface SkillDoc {
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<SkillDoc>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform(),
    },
  }
);

skillSchema.index({ isActive: 1, name: 1 });

export const Skill: Model<SkillDoc> = model<SkillDoc>("Skill", skillSchema);
