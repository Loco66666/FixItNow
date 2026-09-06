import { Schema, model, Types, type Model } from "mongoose";
import { ProviderRealtimeStatus as RealtimeStatusEnum } from "@fixitnow/types";
import { jsonTransform } from "../_transform";

export interface ProviderRealtimeStatusDoc {
  professional: Types.ObjectId;
  status: RealtimeStatusEnum;
  createdAt: Date;
  updatedAt: Date;
}

const providerRealtimeStatusSchema = new Schema<ProviderRealtimeStatusDoc>(
  {
    professional: {
      type: Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(RealtimeStatusEnum),
      required: true,
      default: RealtimeStatusEnum.OPEN,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: jsonTransform({ professional: "professionalId" }),
    },
  }
);

export const ProviderRealtimeStatus: Model<ProviderRealtimeStatusDoc> =
  model<ProviderRealtimeStatusDoc>(
    "ProviderRealtimeStatus",
    providerRealtimeStatusSchema
  );
