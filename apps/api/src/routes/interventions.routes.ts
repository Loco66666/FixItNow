import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  createInterventionController,
  getInterventionController,
  getInterventionHistoryController,
  listMyInterventionsController,
} from "../controllers/interventions.controller";

const router = Router();

const interventionIdParamSchema = z.object({
  id: z.string().min(1),
});

const createInterventionBodySchema = z.object({
  vehicleId: z.string().min(1),
  urgency: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  services: z.array(z.string().trim().min(1)).max(50).optional(),
  currency: z.string().trim().length(3).toUpperCase(),
  scheduledAt: z.coerce.date().optional(),
});

const interventionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

router.get(
  "/mine",
  requireAuth,
  validate({ query: interventionListQuerySchema }),
  listMyInterventionsController
);

router.post(
  "/",
  requireAuth,
  rateLimit({
    name: "interventions.create",
    max: 20,
    windowSec: 60,
  }),
  validate({ body: createInterventionBodySchema }),
  createInterventionController
);

router.get(
  "/:id/history",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getInterventionHistoryController
);

router.get(
  "/:id",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getInterventionController
);

export default router;
