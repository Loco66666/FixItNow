import { Router } from "express";
import { interventionIdParamSchema } from "@fixitnow/types";
import { streamInterventionEvents } from "../controllers/events.controller";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";

const router = Router();

/**
 * GET /events/intervention/:id
 * Server-Sent Events stream for one intervention (owner customer or assigned
 * professional). Connection-oriented, so the rate limit applies to connection
 * attempts rather than to messages.
 */
router.get(
  "/intervention/:id",
  requireAuth,
  rateLimit({ name: "events.intervention", max: 60, windowSec: 60 }),
  validate({ params: interventionIdParamSchema }),
  streamInterventionEvents
);

export default router;
