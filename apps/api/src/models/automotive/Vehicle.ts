import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface VehicleDoc {
  owner: Types.ObjectId;
  registrationNumber: string;
  vin?: string;
  make: string;
  model: string;
  version?: string;
  year?: number;
  fuelType?: string;
  transmission?: string;
  mileageKm?: number;
  vehicleType?: string;
  photos: Types.ObjectId[];
  maintenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<VehicleDoc>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
      index: true,
    },
    vin: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 17,
      sparse: true,
      index: true,
    },
    make: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    model: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    version: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    year: {
      type: Number,
      min: 1886,
      max: 2100,
    },
    fuelType: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    transmission: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    mileageKm: {
      type: Number,
      min: 0,
    },
    vehicleType: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    photos: {
      type: [Schema.Types.ObjectId],
      ref: "Media",
      default: [],
    },
    maintenance: {
      type: Schema.Types.Mixed,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({
        owner: "ownerId",
      }),
    },
  }
);

vehicleSchema.index({ owner: 1, createdAt: -1 });
vehicleSchema.index({ registrationNumber: 1 }, { unique: true });
vehicleSchema.index(
  { vin: 1 },
  {
    unique: true,
    sparse: true,
    name: "vehicle_vin_unique",
  }
);

export const Vehicle: Model<VehicleDoc> = model<VehicleDoc>(
  "Vehicle",
  vehicleSchema
);
