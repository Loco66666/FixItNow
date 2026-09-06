import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { logger } from "../config/logger";
import { Intervention } from "../models/automotive/Intervention";
import { Professional } from "../models/automotive/Professional";
import { subscribeInterventionEvent } from "../services/intervention-events";
import { AppError } from "../utils/AppError";

const HEARTBEAT_MS = 15_000;

/**
 * GET /events/intervention/:id — Server-Sent Events stream.
 *
 * Access is restricted to the intervention owner (customer) or the assigned
 * professional; anyone else receives a 404 (multi-tenant / existence opacity).
 * No replay is kept: on reconnect the client re-fetches the current state via
 * GET /interventions/:id — the stream is a live projection only.
 */
export async function streamInterventionEvents(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw AppError.unauthorized();
    const interventionId = req.params.id;
    if (!Types.ObjectId.isValid(interventionId)) {
      throw AppError.badRequest("Invalid interventionId");
    }
    const userId = req.auth.userId;

    const intervention = await Intervention.findById(
      new Types.ObjectId(interventionId)
    )
      .select("customer professional")
      .lean();
    if (!intervention) {
      throw AppError.notFound("Intervention");
    }

    const isCustomer = String(intervention.customer) === userId;
    let isAssignedProfessional = false;
    if (!isCustomer && intervention.professional) {
      const pro = await Professional.findById(intervention.professional)
        .select("user")
        .lean();
      isAssignedProfessional = pro ? String(pro.user) === userId : false;
    }
    if (!isCustomer && !isAssignedProfessional) {
      throw AppError.notFound("Intervention");
    }

    // ---- SSE handshake (compression must not touch the stream) ----
    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(": connected\n\n");

    let finished = false;
    const heartbeat = setInterval(() => {
      if (!finished) res.write(": ping\n\n");
    }, HEARTBEAT_MS);
    heartbeat.unref();

    let unsubscribe: () => Promise<void> = async () => undefined;
    try {
      unsubscribe = await subscribeInterventionEvent(
        interventionId,
        (event) => {
          if (finished) return;
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      );
    } catch (err) {
      // Headers already sent: we can't 500 via next(); signal and close.
      logger.warn(
        { err: { message: (err as Error).message } },
        "SSE subscribe failed"
      );
      res.write("event: error\n\n");
      res.end();
      return;
    }

    const close = async () => {
      if (finished) return;
      finished = true;
      clearInterval(heartbeat);
      await unsubscribe();
      res.end();
    };
    req.on("close", () => void close());
    res.on("error", () => void close());
    res.on("close", () => void close());
  } catch (error) {
    next(error);
  }
}
