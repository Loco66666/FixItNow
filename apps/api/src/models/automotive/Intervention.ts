import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { InterventionStatus } from "@fixitnow/types";

export interface InterventionLocation {
  address?: string;
  city?: string;
  postalCode?: string;
  coordinates: [number, number];
}

export interface InterventionDoc {
  customer: Types.ObjectId;
  vehicle: Types.ObjectId;
  status: InterventionStatus;
  title: string;
  description: string;
  location: InterventionLocation;
  urgency?: string;
  requestedAt: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const interventionSchema = new Schema<InterventionDoc>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(InterventionStatus),
      required: true,
      default: InterventionStatus.REQUESTED,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    location: {
      address: {
        type: String,
        trim: true,
        maxlength: 300,
      },
      city: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      postalCode: {
        type: String,
        trim: true,
        maxlength: 20,
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
    urgency: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    scheduledAt: {
      type: Date,
      index: true,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        customer: "customerId",
        vehicle: "vehicleId",
      }),
    },
  }
);

interventionSchema.index({ customer: 1, createdAt: -1 });
interventionSchema.index({ vehicle: 1, createdAt: -1 });
interventionSchema.index({ status: 1, requestedAt: -1 });
interventionSchema.index({
  "location.coordinates": "2dsphere",
});

interventionSchema.pre("validate", function (next) {
  if (
    this.scheduledAt &&
    this.completedAt &&
    this.completedAt < this.scheduledAt
  ) {
    return next(new Error("completedAt cannot be earlier than scheduledAt."));
  }

  if (this.startedAt && this.completedAt && this.completedAt < this.startedAt) {
    return next(new Error("completedAt cannot be earlier than startedAt."));
  }

  next();
});

export const Intervention: Model<InterventionDoc> = model<InterventionDoc>(
  "Intervention",
  interventionSchema
);
