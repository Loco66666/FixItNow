import type { NextFunction, Request, Response } from "express";
import {
  createIntervention,
  getCustomerIntervention,
  getInterventionStatusHistory,
  listCustomerInterventions,
} from "../services/intervention.service";
import {
  listMatchingCandidates,
  runMatchingForIntervention,
} from "../services/matching.service";

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
