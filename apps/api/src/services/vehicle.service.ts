import { Types } from "mongoose";
import { Vehicle } from "../models/automotive/Vehicle";
import { AppError } from "../utils/AppError";

export interface VehicleFields {
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
}

export type CreateVehicleInput = VehicleFields & { ownerId: string };

export type UpdateVehicleInput = Partial<VehicleFields>;

export interface ListOwnerVehiclesOptions {
  limit?: number;
  skip?: number;
}

function toObjectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest(`Invalid ${field}`);
  }
  return new Types.ObjectId(value);
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

export async function createVehicle(input: CreateVehicleInput) {
  const ownerId = toObjectId(input.ownerId, "ownerId");

  // Friendlier than a raw 11000 from the unique index.
  const existing = await Vehicle.exists({
    registrationNumber: input.registrationNumber,
  });
  if (existing) {
    throw AppError.conflict(
      "A vehicle with this registration number already exists."
    );
  }

  try {
    return await Vehicle.create({
      owner: ownerId,
      registrationNumber: input.registrationNumber,
      vin: input.vin,
      make: input.make,
      model: input.model,
      version: input.version,
      year: input.year,
      fuelType: input.fuelType,
      transmission: input.transmission,
      mileageKm: input.mileageKm,
      vehicleType: input.vehicleType,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw AppError.conflict(
        "A vehicle with this registration number or VIN already exists."
      );
    }
    throw err;
  }
}

export async function listOwnerVehicles(
  ownerId: string,
  options: ListOwnerVehiclesOptions = {}
) {
  const ownerObjectId = toObjectId(ownerId, "ownerId");

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);

  const [items, total] = await Promise.all([
    Vehicle.find({ owner: ownerObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Vehicle.countDocuments({ owner: ownerObjectId }),
  ]);

  return { items, total, limit, skip };
}

export async function getOwnerVehicle(vehicleId: string, ownerId: string) {
  const vehicle = await Vehicle.findOne({
    _id: toObjectId(vehicleId, "vehicleId"),
    owner: toObjectId(ownerId, "ownerId"),
  });

  if (!vehicle) {
    throw AppError.notFound("Vehicle");
  }

  return vehicle;
}

export async function updateOwnerVehicle(
  vehicleId: string,
  ownerId: string,
  patch: UpdateVehicleInput
) {
  // Scoped by owner: another customer's vehicle yields 404, not 403.
  const vehicle = await getOwnerVehicle(vehicleId, ownerId);

  if (
    patch.registrationNumber &&
    patch.registrationNumber !== vehicle.registrationNumber
  ) {
    const existing = await Vehicle.exists({
      registrationNumber: patch.registrationNumber,
      _id: { $ne: vehicle._id },
    });
    if (existing) {
      throw AppError.conflict(
        "A vehicle with this registration number already exists."
      );
    }
  }

  if (patch.vin && patch.vin !== vehicle.vin) {
    const existing = await Vehicle.exists({
      vin: patch.vin,
      _id: { $ne: vehicle._id },
    });
    if (existing) {
      throw AppError.conflict("A vehicle with this VIN already exists.");
    }
  }

  vehicle.set(patch);
  return vehicle.save();
}

export async function deleteOwnerVehicle(vehicleId: string, ownerId: string) {
  const vehicle = await getOwnerVehicle(vehicleId, ownerId);
  await vehicle.deleteOne();
  return { deleted: true as const };
}
