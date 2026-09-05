import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface GarageLocation {
  type: "Point";
  coordinates: [number, number];
}

export interface GarageDoc {
  professional: Types.ObjectId;
  name: string;
  legalName?: string;
  registrationNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  location?: GarageLocation;
  phone?: string;
  email?: string;
  website?: string;
  createdAt: Date;
  updatedAt: Date;
}

const garageSchema = new Schema<GarageDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    legalName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    registrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      index: true,
    },
    postalCode: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    location: {
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
          message: "Location coordinates must be [longitude, latitude].",
        },
      },
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    website: {
      type: String,
      trim: true,
      maxlength: 500,
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

garageSchema.index({ location: "2dsphere" });
garageSchema.index({ city: 1, name: 1 });

export const Garage: Model<GarageDoc> = model<GarageDoc>(
  "Garage",
  garageSchema
);
