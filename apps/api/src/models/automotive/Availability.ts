import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";
import { AvailabilityStatus } from "@fixitnow/types";

export interface AvailabilityDoc {
  professional: Types.ObjectId;
  status: AvailabilityStatus;
  startAt?: Date;
  endAt?: Date;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const availabilitySchema = new Schema<AvailabilityDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(AvailabilityStatus),
      required: true,
      index: true,
    },
    startAt: {
      type: Date,
    },
    endAt: {
      type: Date,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "Europe/Paris",
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

availabilitySchema.index({
  professional: 1,
  status: 1,
  startAt: 1,
  endAt: 1,
});

availabilitySchema.pre("validate", function (next) {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    return next(new Error("endAt must be later than startAt."));
  }

  next();
});

export const Availability: Model<AvailabilityDoc> = model<AvailabilityDoc>(
  "Availability",
  availabilitySchema
);
