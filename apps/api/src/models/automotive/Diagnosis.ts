import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface DiagnosisDoc {
  intervention: Types.ObjectId;
  professional: Types.ObjectId;
  summary: string;
  findings: string;
  recommendations?: string;
  estimatedDurationMinutes?: number;
  estimatedPartsCostCents?: number;
  estimatedLaborCostCents?: number;
  createdAt: Date;
  updatedAt: Date;
}

const diagnosisSchema = new Schema<DiagnosisDoc>(
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
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    findings: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    recommendations: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    estimatedDurationMinutes: {
      type: Number,
      min: 1,
      max: 10080,
    },
    estimatedPartsCostCents: {
      type: Number,
      min: 0,
    },
    estimatedLaborCostCents: {
      type: Number,
      min: 0,
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

diagnosisSchema.index({ intervention: 1, createdAt: -1 });
diagnosisSchema.index({ professional: 1, createdAt: -1 });

export const Diagnosis: Model<DiagnosisDoc> = model<DiagnosisDoc>(
  "Diagnosis",
  diagnosisSchema
);
