import type { NextFunction, Request, Response } from "express";
import type { InterventionAction } from "@fixitnow/types";
import {
  createQuote,
  decideQuote,
} from "../services/intervention-quotes.service";
import type { QuoteItemInput } from "../services/intervention-quotes.service";

/**
 * POST /interventions/:id/quote
 *
 * Lets the authenticated professional (assigned, in DIAGNOSING) submit a devis
 * (quote_item list with French VAT ladders). `requireProfessional` gates the
 * domain role; the service enforces assignment + the QUOTE_PENDING transition.
 */
export async function createQuoteController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const items: QuoteItemInput[] = (req.body.items ?? []).map((it: any) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      tax_rate: Number(it.tax_rate),
      kind: it.kind,
    }));

    const result = await createQuote({
      interventionId: req.params.id,
      professionalUserId: req.auth.userId,
      items,
      notes: typeof req.body.notes === "string" ? req.body.notes : undefined,
      currency: req.body.currency ? String(req.body.currency) : undefined,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /interventions/:id/quote/:quoteId/accept | /reject
 *
 * Customer decision on a devis of their own intervention. The route mounts
 * `requireAuth` only — the service enforces ownership (403), the state machine
 * (409 unless QUOTE_PENDING) and the compare-&-swap.
 */
export async function decideQuoteController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await decideQuote({
      interventionId: req.params.id,
      quoteId: req.params.quoteId,
      customerUserId: req.auth.userId,
      decision: req.params.decision as "accept" | "reject",
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

import {
  createIntervention,
  getCustomerIntervention,
  getInterventionStatusHistory,
  listCustomerInterventions,
} from "../services/intervention.service";
import {
  acceptCandidate,
  listMatchingCandidates,
  runMatchingForIntervention,
} from "../services/matching.service";
import { runProviderAction } from "../services/intervention-actions.service";

export async function createInterventionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const intervention = await createIntervention({
      ...req.body,
      customerId: req.auth.userId,
    });

    res.status(201).json({ data: intervention });
  } catch (error) {
    next(error);
  }
}

export async function getInterventionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const intervention = await getCustomerIntervention(
      req.params.id,
      req.auth.userId
    );

    res.json({ data: intervention });
  } catch (error) {
    next(error);
  }
}

export async function listMyInterventionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await listCustomerInterventions(req.auth.userId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });

    res.json({
      data: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        skip: result.skip,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getInterventionHistoryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const history = await getInterventionStatusHistory(
      req.params.id,
      req.auth.userId
    );

    res.json({ data: history });
  } catch (error) {
    next(error);
  }
}

export async function runMatchingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const candidates = await runMatchingForIntervention(
      req.params.id,
      req.auth.userId
    );

    res.json({ data: candidates });
  } catch (error) {
    next(error);
  }
}

export async function getMatchingCandidatesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const candidates = await listMatchingCandidates(
      req.params.id,
      req.auth.userId
    );

    res.json({ data: candidates });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /interventions/:id/match/:candidateId/accept
 *
 * Lets the authenticated provider claim the matching candidate proposed to them.
 * `requireProfessional` (mounted on the route) guarantees `domainRole === PRO`
 * before this handler runs.
 */
export async function acceptMatchingCandidateController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await acceptCandidate({
      interventionId: req.params.id,
      candidateId: req.params.candidateId,
      professionalUserId: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /interventions/:id/actions/:action
 *
 * Runs a provider lifecycle action (en-route | arrive | diagnose | complete)
 * on an intervention the caller is assigned to. `requireProfessional` gates
 * the domain role; the service enforces assignment + the state machine.
 */
export async function runProviderActionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await runProviderAction({
      interventionId: req.params.id,
      professionalUserId: req.auth.userId,
      action: req.params.action as InterventionAction,
      note: typeof req.body?.note === "string" ? req.body.note : undefined,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
