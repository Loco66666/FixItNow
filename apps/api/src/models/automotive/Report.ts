import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface ReportDoc {
  intervention: Types.ObjectId;
  professional: Types.ObjectId;
  summary: string;
  workPerformed: string;
  recommendations?: string;
  beforeMedia: Types.ObjectId[];
  afterMedia: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<ReportDoc>(
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
      maxlength: 1000,
    },
    workPerformed: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    recommendations: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    beforeMedia: {
      type: [Schema.Types.ObjectId],
      ref: "Media",
      default: [],
    },
    afterMedia: {
      type: [Schema.Types.ObjectId],
      ref: "Media",
      default: [],
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

reportSchema.index({
  intervention: 1,
  createdAt: -1,
});

reportSchema.index({
  professional: 1,
  createdAt: -1,
});

export const Report: Model<ReportDoc> = model<ReportDoc>(
  "Report",
  reportSchema
);
