import { z } from "zod";

/**
 * Shared Zod contracts for the customer-facing interventions module.
 * These schemas are the single source of truth for request validation in the
 * API and (later) for react-hook-form resolvers on the web app, so the wire
 * contract cannot drift between client and server.
 */

export const interventionIdParamSchema = z.object({
  id: z.string().min(1),
});

/** Params for a route acting on a specific matching candidate of an intervention. */
export const interventionMatchCandidateParamSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
});

export const createInterventionSchema = z.object({
  vehicleId: z.string().min(1),
  urgency: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).optional(),
  locationContext: z
    .enum(["HOME", "PARKING", "ROAD", "BUSINESS", "HIGHWAY", "EXPRESS_ROAD"])
    .optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  services: z.array(z.string().trim().min(1)).max(50).optional(),
  /** Kept for forward-compatibility; the API always forces "EUR" for now. */
  currency: z.string().trim().length(3).toUpperCase().optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const interventionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
