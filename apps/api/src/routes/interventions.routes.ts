import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireProfessional } from "../middlewares/requireProfessional";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  createInterventionSchema,
  createQuoteSchema,
  interventionActionBodySchema,
  interventionActionParamSchema,
  interventionIdParamSchema,
  interventionListQuerySchema,
  interventionMatchCandidateParamSchema,
  interventionQuoteParamSchema,
} from "@fixitnow/types";
import {
  acceptMatchingCandidateController,
  createInterventionController,
  createQuoteController,
  decideQuoteController,
  getInterventionController,
  getInterventionHistoryController,
  getMatchingCandidatesController,
  listMyInterventionsController,
  listQuotesController,
  runMatchingController,
  runProviderActionController,
} from "../controllers/interventions.controller";
import { authorizePaymentController } from "../controllers/payments.controller";
import { getConversationController } from "../controllers/conversations.controller";

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

/**
 * POST /interventions/:id/actions/:action
 *
 * Provider lifecycle actions (en-route | arrive | diagnose | complete) on an
 * intervention the caller is assigned to. Owner-gated (requireProfessional) +
 * rate-limited; legality is enforced by the state table in
 * `services/intervention-state.ts` and every transition is journalled into
 * InterventionStatusHistory and streamed on the intervention SSE channel.
 */
router.post(
  "/:id/actions/:action",
  requireAuth,
  requireProfessional,
  rateLimit({ name: "interventions.actions", max: 60, windowSec: 60 }),
  validate({
    params: interventionActionParamSchema,
    body: interventionActionBodySchema,
  }),
  runProviderActionController
);

/**
 * POST /interventions/:id/quote
 *
 * Creates a provider quote (devis) — the pro submits a typed item list with
 * French VAT ladders on an intervention assigned to them in DIAGNOSING.
 * `requireProfessional` + `requireAssignedProvider` gate the domain role; the
 * service enforces assignment + the DIAGNOSING → QUOTE_PENDING transition.
 */
router.post(
  "/:id/quote",
  requireAuth,
  requireProfessional,
  rateLimit({ name: "interventions.quote.create", max: 10, windowSec: 60 }),
  validate({ params: interventionIdParamSchema, body: createQuoteSchema }),
  createQuoteController
);

/**
 * GET /interventions/:id/quotes
 *
 * Lists the devis of one intervention, newest first. Multi-tenant: only the
 * owning customer or the assigned provider (service-level 403 otherwise).
 */
router.get(
  "/:id/quotes",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  listQuotesController
);

/**
 * POST /interventions/:id/quote/:quoteId/:decision (accept | reject)
 *
 * Customer decision on a devis of their own intervention. `requireAuth` only —
 * the service enforces ownership (403), the state machine (409 unless
 * QUOTE_PENDING) and the compare-&-swap.
 */
router.post(
  "/:id/quote/:quoteId/:decision",
  requireAuth,
  rateLimit({ name: "interventions.quote.decide", max: 30, windowSec: 60 }),
  validate({ params: interventionQuoteParamSchema }),
  decideQuoteController
);

/**
 * POST /interventions/:id/payments/authorize
 *
 * Customer pre-authorizes the ACCEPTED devis amount (manual-capture intent).
 */
router.post(
  "/:id/payments/authorize",
  requireAuth,
  rateLimit({ name: "payments.authorize", max: 10, windowSec: 60 }),
  validate({ params: interventionIdParamSchema }),
  authorizePaymentController
);

/**
 * GET /interventions/:id/conversation
 *
 * Get (or lazily create) the 1:1 conversation thread of an intervention.
 * Participant-only (owner customer or assigned provider) — service-level 403.
 */
router.get(
  "/:id/conversation",
  requireAuth,
  validate({ params: interventionIdParamSchema }),
  getConversationController
);

export default router;
