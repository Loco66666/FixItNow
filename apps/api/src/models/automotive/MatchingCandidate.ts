import { Schema, model, Types, type Model } from "mongoose";
import { MatchCandidateStatus } from "@fixitnow/types";
import { jsonTransform } from "../_transform";

export interface MatchingCandidateDoc {
  intervention: Types.ObjectId;
  professional: Types.ObjectId;
  status: MatchCandidateStatus;
  score: number;
  distanceKm: number;
  etaMinutes: number;
  skillScore: number;
  availabilityScore: number;
  priceScore: number;
  ratingScore: number;
  etaScore: number;
  historyScore: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const componentScore = {
  type: Number,
  required: true,
  min: 0,
  max: 1,
};

const matchingCandidateSchema = new Schema<MatchingCandidateDoc>(
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
      enum: Object.values(MatchCandidateStatus),
      required: true,
      default: MatchCandidateStatus.PENDING,
      index: true,
    },
    // Weighted total, [0, 100], one decimal.
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true,
    },
    distanceKm: {
      type: Number,
      required: true,
      min: 0,
    },
    etaMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    skillScore: componentScore,
    availabilityScore: componentScore,
    priceScore: componentScore,
    ratingScore: componentScore,
    etaScore: componentScore,
    historyScore: componentScore,
    // Matching offers are perishable: stale candidates must not be contacted.
    expiresAt: {
      type: Date,
      required: true,
      index: true,
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

matchingCandidateSchema.index({ intervention: 1, createdAt: -1 });
matchingCandidateSchema.index({ intervention: 1, status: 1, score: -1 });
matchingCandidateSchema.index({ professional: 1, createdAt: -1 });
// One row per (intervention, professional): re-running the matching updates
// scores in place instead of piling up duplicates.
matchingCandidateSchema.index(
  { intervention: 1, professional: 1 },
  { unique: true, name: "intervention_professional_unique" }
);

export const MatchingCandidate: Model<MatchingCandidateDoc> =
  model<MatchingCandidateDoc>("MatchingCandidate", matchingCandidateSchema);
