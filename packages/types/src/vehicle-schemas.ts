import { z } from "zod";

/**
 * Shared Zod contracts for the customer vehicle module (PHASE 03).
 * The registration number is normalized to uppercase so lookups and the
 * unique index stay consistent regardless of user input.
 */

const registrationNumberField = z.string().trim().min(2).max(20).toUpperCase();

const vinField = z.string().trim().min(11).max(17).toUpperCase().optional();

const optionalTextField = (max: number) =>
  z.string().trim().min(1).max(max).optional();

export const createVehicleSchema = z.object({
  registrationNumber: registrationNumberField,
  vin: vinField,
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  version: optionalTextField(150),
  year: z.number().int().min(1886).max(2100).optional(),
  fuelType: optionalTextField(50),
  transmission: optionalTextField(50),
  mileageKm: z.number().int().min(0).max(2_000_000).optional(),
  vehicleType: optionalTextField(50),
});

export const updateVehicleSchema = createVehicleSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const vehicleIdParamSchema = z.object({
  id: z.string().min(1),
});

export const vehicleListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
