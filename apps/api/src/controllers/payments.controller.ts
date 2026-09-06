import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  authorizePayment,
  cancelPayment,
  handleProviderEvent,
} from "../services/payment.service";
import { getStripeGateway } from "../services/stripe.client";

/** POST /interventions/:id/payments/authorize — customer pre-authorizes the devis. */
export async function authorizePaymentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const payment = await authorizePayment({
      interventionId: req.params.id,
      customerUserId: req.auth.userId,
    });
    res.status(201).json({ data: payment });
  } catch (error) {
    next(error);
  }
}

/** POST /payments/:paymentId/cancel — customer cancels a live authorization. */
export async function cancelPaymentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");
    const payment = await cancelPayment({
      paymentId: req.params.paymentId,
      customerUserId: req.auth.userId,
    });
    res.status(200).json({ data: payment });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /webhooks/stripe
 *
 * Mounted with express.raw BEFORE the global json parser so the signature can
 * be verified against the untouched payload bytes. Without a configured
 * STRIPE_WEBHOOK_SECRET (local dev / tests) the parsed event is trusted.
 * Processing is idempotent: replays are acked 200 as duplicates.
 */
export async function stripeWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    let event;
    const signature = req.header("stripe-signature");
    if (signature) {
      event = getStripeGateway().constructWebhookEvent(
        req.body as Buffer,
        signature
      );
    } else {
      const body = req.body as { id?: string; type?: string; data?: unknown };
      if (!body?.id || !body?.type) {
        return next(AppError.badRequest("Malformed webhook payload"));
      }
      event = {
        id: body.id,
        type: body.type,
        paymentIntentId: (body.data as { object?: { id?: string } })?.object
          ?.id,
      };
    }

    const outcome = await handleProviderEvent(event);
    res.json({ received: true, outcome });
  } catch (error) {
    next(error);
  }
}
