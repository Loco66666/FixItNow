import { Schema, model, Types, type Model } from "mongoose";
import {
  CurrencyCode,
  InterventionStatus,
  InterventionUrgency,
} from "@fixitnow/types";
import { jsonTransform } from "../_transform";

export interface InterventionLocation {
  address: string;
  city?: string;
  postalCode?: string;
  coordinates: [number, number];
}

export interface InterventionDoc {
  customer: Types.ObjectId;
  vehicle: Types.ObjectId;
  professional?: Types.ObjectId;
  status: InterventionStatus;
  urgency: InterventionUrgency;
  title: string;
  description: string;
  location: InterventionLocation;
  services: string[];
  currency: CurrencyCode;
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
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(InterventionStatus),
      required: true,
      default: InterventionStatus.REQUESTED,
      index: true,
    },
    urgency: {
      type: String,
      enum: Object.values(InterventionUrgency),
      required: true,
      default: InterventionUrgency.NORMAL,
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
        required: true,
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
    services: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= 50,
        message: "An intervention cannot contain more than 50 services.",
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
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
        professional: "professionalId",
      }),
    },
  }
);

interventionSchema.index({ customer: 1, createdAt: -1 });
interventionSchema.index({ vehicle: 1, createdAt: -1 });
interventionSchema.index({ professional: 1, createdAt: -1 });
interventionSchema.index({ status: 1, requestedAt: -1 });
interventionSchema.index({ urgency: 1, requestedAt: -1 });
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
