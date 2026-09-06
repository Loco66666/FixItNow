import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@fixitnow/types";
import { AppError } from "../utils/AppError";

/**
 * Gates a route to authenticated users whose automotive domain role maps to a
 * provider (`PROFESSIONAL`). A customer (role `user`) is rejected with 403.
 *
 * NOTE: we intentionally check `domainRole` (mapped from the legacy JWT
 * `role`) and not `req.auth.role`, so the gate stays aligned with the
 * `requireAuth` contract regardless of how the JWT payload is normalised.
 */
export function requireProfessional(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    return next(AppError.unauthorized());
  }
  if (req.auth.domainRole !== UserRole.PROFESSIONAL) {
    return next(
      AppError.forbidden(
        "Only registered professionals can accept interventions"
      )
    );
  }
  next();
}
