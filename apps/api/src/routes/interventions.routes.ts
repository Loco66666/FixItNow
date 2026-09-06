import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireProfessional } from "../middlewares/requireProfessional";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  createInterventionSchema,
  interventionIdParamSchema,
  interventionListQuerySchema,
  interventionMatchCandidateParamSchema,
} from "@fixitnow/types";
import {
  acceptMatchingCandidateController,
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

/**
 * POST /interventions/:id/match/:candidateId/accept
 *
 * Claims a candidate produced by matching for `interventionId`, on behalf of
 * the calling professional. Owner-gated: requireAuth + requireProfessional
 * (domainRole PRO) + param validation + matching.accept rate limit. Concurrency
 * is resolved in `acceptCandidate` via single-row compare-&-swap (409 on races).
 */
router.post(
  "/:id/match/:candidateId/accept",
  requireAuth,
  requireProfessional,
  rateLimit({ name: "interventions.match.accept", max: 30, windowSec: 60 }),
  validate({ params: interventionMatchCandidateParamSchema }),
  acceptMatchingCandidateController
);

router.get(
  "/:id",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getInterventionController
);

export default router;
