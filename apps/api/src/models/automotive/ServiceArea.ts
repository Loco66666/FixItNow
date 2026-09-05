import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface ServiceAreaLocation {
  type: "Point";
  coordinates: [number, number];
}

export interface ServiceAreaDoc {
  professional: Types.ObjectId;
  name: string;
  center: ServiceAreaLocation;
  radiusKm: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const serviceAreaSchema = new Schema<ServiceAreaDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    center: {
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
          message: "Center coordinates must be [longitude, latitude].",
        },
      },
    },
    radiusKm: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
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
      }),
    },
  }
);

serviceAreaSchema.index({ center: "2dsphere" });
serviceAreaSchema.index({ professional: 1, isActive: 1 });

export const ServiceArea: Model<ServiceAreaDoc> = model<ServiceAreaDoc>(
  "ServiceArea",
  serviceAreaSchema
);
