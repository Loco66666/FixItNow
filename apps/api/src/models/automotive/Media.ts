import { Schema, model, Types, type Model } from "mongoose";
import { jsonTransform } from "../_transform";

export interface MediaDoc {
  owner: Types.ObjectId;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  mimeType: string;
  storageKey: string;
  url?: string;
  filename?: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<MediaDoc>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["IMAGE", "VIDEO", "DOCUMENT"],
      required: true,
      index: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
      unique: true,
      index: true,
    },
    url: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
    filename: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
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

mediaSchema.index({
  owner: 1,
  createdAt: -1,
});

mediaSchema.index({
  type: 1,
  createdAt: -1,
});

export const Media: Model<MediaDoc> = model<MediaDoc>("Media", mediaSchema);
