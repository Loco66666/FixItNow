import { Types } from "mongoose";
import { ProviderRealtimeStatus as RealtimeStatusEnum } from "@fixitnow/types";
import { Professional } from "../models/automotive/Professional";
import { ProviderRealtimeStatus } from "../models/automotive/ProviderRealtimeStatus";
import { AppError } from "../utils/AppError";

/**
 * Upsert the real-time status of the professional bound to the authenticated
 * user. One row per professional (unique index on `professional`).
 */
export async function setProviderRealtimeStatusForUser(
  professionalUserId: string,
  status: RealtimeStatusEnum
): Promise<{ professionalId: string; status: RealtimeStatusEnum }> {
  const professional = await Professional.findOne({
    user: new Types.ObjectId(professionalUserId),
    isActive: true,
  })
    .select("_id")
    .lean();

  if (!professional) {
    throw AppError.forbidden(
      "You are not registered as an active professional"
    );
  }

  await ProviderRealtimeStatus.updateOne(
    { professional: professional._id },
    { $set: { status }, $setOnInsert: { professional: professional._id } },
    { upsert: true }
  );

  return {
    professionalId: professional._id.toHexString(),
    status,
  };
}

export async function getProviderRealtimeStatus(professionalId: string) {
  const row = await ProviderRealtimeStatus.findOne({
    professional: new Types.ObjectId(professionalId),
  }).lean();
  if (!row) return null;
  return {
    professionalId: row.professional.toHexString(),
    status: row.status,
    updatedAt: row.updatedAt,
  };
}
