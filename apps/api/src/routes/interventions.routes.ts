import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  createInterventionSchema,
  interventionIdParamSchema,
  interventionListQuerySchema,
} from "@fixitnow/types";
import {
  createInterventionController,
  getInterventionController,
  getInterventionHistoryController,
  getMatchingCandidatesController,
  listMyInterventionsController,
  runMatchingController,
} from "../controllers/interventions.controller";

const router = Router();

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
  validate({ body: createInterventionSchema }),
  createInterventionController
);

router.get(
  "/:id/history",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getInterventionHistoryController
);

router.post(
  "/:id/match",
  requireAuth,
  rateLimit({
    name: "interventions.match",
    max: 10,
    windowSec: 60,
  }),
  validate({ params: interventionIdParamSchema }),
  runMatchingController
);

router.get(
  "/:id/match",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getMatchingCandidatesController
);

router.get(
  "/:id",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getInterventionController
);

export default router;
