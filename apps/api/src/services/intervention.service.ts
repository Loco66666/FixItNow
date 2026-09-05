import { Types } from "mongoose";
import { InterventionStatus, InterventionUrgency } from "@fixitnow/types";

import { User } from "../models/User";
import { Vehicle } from "../models/automotive/Vehicle";
import { Intervention } from "../models/automotive/Intervention";
import { InterventionStatusHistory } from "../models/automotive/InterventionStatusHistory";
import { AppError } from "../utils/AppError";

export interface CreateInterventionInput {
  customerId: string;
  vehicleId: string;
  urgency?: InterventionUrgency;
  title: string;
  description: string;
  address: string;
  city?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  services?: string[];
  currency: string;
  scheduledAt?: Date;
}

export interface ListCustomerInterventionsOptions {
  limit?: number;
  skip?: number;
}

const isObjectId = (value: string): boolean => Types.ObjectId.isValid(value);

function toObjectId(value: string, field: string): Types.ObjectId {
  if (!isObjectId(value)) {
    throw AppError.badRequest(`Invalid ${field}`);
  }

  return new Types.ObjectId(value);
}

export async function createIntervention(input: CreateInterventionInput) {
  const customerId = toObjectId(input.customerId, "customerId");
  const vehicleId = toObjectId(input.vehicleId, "vehicleId");

  const customer = await User.findById(customerId).select("_id").lean();

  if (!customer) {
    throw AppError.notFound("Customer");
  }

  const vehicle = await Vehicle.findOne({
    _id: vehicleId,
    owner: customerId,
  })
    .select("_id owner")
    .lean();

  if (!vehicle) {
    throw AppError.notFound("Vehicle");
  }

  const intervention = await Intervention.create({
    customer: customerId,
    vehicle: vehicleId,
    status: InterventionStatus.REQUESTED,
    urgency: input.urgency ?? InterventionUrgency.NORMAL,
    title: input.title,
    description: input.description,
    location: {
      address: input.address,
      city: input.city,
      postalCode: input.postalCode,
      coordinates: [input.longitude, input.latitude],
    },
    services: input.services ?? [],
    currency: input.currency.toUpperCase(),
    requestedAt: new Date(),
    scheduledAt: input.scheduledAt,
  });

  try {
    await InterventionStatusHistory.create({
      intervention: intervention._id,
      toStatus: InterventionStatus.REQUESTED,
      reason: "Intervention created",
    });
  } catch (error) {
    await Intervention.deleteOne({ _id: intervention._id });
    throw error;
  }

  return intervention;
}

export async function getCustomerIntervention(
  interventionId: string,
  customerId: string
) {
  const interventionObjectId = toObjectId(interventionId, "interventionId");
  const customerObjectId = toObjectId(customerId, "customerId");

  const intervention = await Intervention.findOne({
    _id: interventionObjectId,
    customer: customerObjectId,
  });

  if (!intervention) {
    throw AppError.notFound("Intervention");
  }

  return intervention;
}

export async function listCustomerInterventions(
  customerId: string,
  options: ListCustomerInterventionsOptions = {}
) {
  const customerObjectId = toObjectId(customerId, "customerId");

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [items, total] = await Promise.all([
    Intervention.find({ customer: customerObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Intervention.countDocuments({ customer: customerObjectId }),
  ]);

  return {
    items,
    total,
    limit,
    skip,
  };
}

export async function getInterventionStatusHistory(
  interventionId: string,
  customerId: string
) {
  const interventionObjectId = toObjectId(interventionId, "interventionId");
  const customerObjectId = toObjectId(customerId, "customerId");

  const intervention = await Intervention.exists({
    _id: interventionObjectId,
    customer: customerObjectId,
  });

  if (!intervention) {
    throw AppError.notFound("Intervention");
  }

  return InterventionStatusHistory.find({
    intervention: interventionObjectId,
  }).sort({ createdAt: 1 });
}
