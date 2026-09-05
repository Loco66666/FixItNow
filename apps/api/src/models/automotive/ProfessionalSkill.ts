import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface ProfessionalSkillDoc {
  professional: Types.ObjectId;
  skill: Types.ObjectId;
  experienceLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  certification?: string;
  yearsExperience?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const professionalSkillSchema = new Schema<ProfessionalSkillDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    skill: {
      type: Schema.Types.ObjectId,
      ref: "Skill",
      required: true,
      index: true,
    },
    experienceLevel: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      required: true,
      default: "INTERMEDIATE",
    },
    certification: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    yearsExperience: {
      type: Number,
      min: 0,
      max: 100,
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
      transform: jsonTransform({
        professional: "professionalId",
        skill: "skillId",
      }),
    },
  }
);

professionalSkillSchema.index({ professional: 1, skill: 1 }, { unique: true });

professionalSkillSchema.index({
  skill: 1,
  isActive: 1,
  experienceLevel: 1,
});

export const ProfessionalSkill: Model<ProfessionalSkillDoc> =
  model<ProfessionalSkillDoc>("ProfessionalSkill", professionalSkillSchema);
