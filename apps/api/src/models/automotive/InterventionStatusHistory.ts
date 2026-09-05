import { Schema, model, Types, type Model } from "mongoose";
import { InterventionStatus } from "@fixitnow/types";
import { jsonTransform } from "../_transform";

export interface InterventionStatusHistoryDoc {
  intervention: Types.ObjectId;
  fromStatus?: InterventionStatus;
  toStatus: InterventionStatus;
  actor?: Types.ObjectId;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const interventionStatusHistorySchema =
  new Schema<InterventionStatusHistoryDoc>(
    {
      intervention: {
        type: Schema.Types.ObjectId,
        ref: "Intervention",
        required: true,
        index: true,
      },
      fromStatus: {
        type: String,
        enum: Object.values(InterventionStatus),
      },
      toStatus: {
        type: String,
        enum: Object.values(InterventionStatus),
        required: true,
        index: true,
      },
      actor: {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
      reason: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
    },
    {
      timestamps: true,
      toJSON: {
        transform: jsonTransform({
          intervention: "interventionId",
          actor: "actorId",
        }),
      },
    }
  );

interventionStatusHistorySchema.index({
  intervention: 1,
  createdAt: 1,
});

export const InterventionStatusHistory: Model<InterventionStatusHistoryDoc> =
  model<InterventionStatusHistoryDoc>(
    "InterventionStatusHistory",
    interventionStatusHistorySchema
  );
