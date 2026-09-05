import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface ReviewDoc {
  intervention: Types.ObjectId;
  customer: Types.ObjectId;
  professional: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    intervention: {
      type: Schema.Types.ObjectId,
      ref: "Intervention",
      required: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "rating must be an integer between 1 and 5.",
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        intervention: "interventionId",
        customer: "customerId",
        professional: "professionalId",
      }),
    },
  }
);

reviewSchema.index(
  {
    intervention: 1,
    customer: 1,
  },
  {
    unique: true,
    name: "intervention_customer_unique",
  }
);

reviewSchema.index({ professional: 1, createdAt: -1 });
reviewSchema.index({ professional: 1, rating: 1 });

export const Review: Model<ReviewDoc> = model<ReviewDoc>(
  "AutomotiveReview",
  reviewSchema
);
