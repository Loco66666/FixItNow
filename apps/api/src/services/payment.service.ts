import { Types } from "mongoose";
import {
  InterventionStatus,
  PaymentStatus,
  QuoteStatus,
  type InterventionEvent,
} from "@fixitnow/types";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { Intervention } from "../models/automotive/Intervention";
import { Payment, type PaymentDoc } from "../models/automotive/Payment";
import { Quote } from "../models/automotive/Quote";
import { WebhookEvent } from "../models/automotive/WebhookEvent";
import { AppError } from "../utils/AppError";
import { getStripeGateway, type ProviderEvent } from "./stripe.client";
import { publishInterventionEvent } from "./intervention-events";

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid id");
  }
  return new Types.ObjectId(value);
}

function serializePayment(payment: PaymentDoc) {
  return {
    paymentId: String(payment._id),
    interventionId: String(payment.intervention),
    customerId: String(payment.customer),
    professionalId: String(payment.professional),
    status: payment.status,
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
    professionalAmountCents: payment.professionalAmountCents,
    currency: payment.currency,
    authorizationExpiresAt: payment.authorizationExpiresAt ?? null,
    paidAt: payment.paidAt ?? null,
    createdAt: payment.createdAt,
  };
}

/**
 * Pre-authorize the accepted devis amount on the customer's card (manual
 * capture). Stripe holds the funds for at most ~7 days; the capture happens
 * when the provider completes the intervention.
 *
 * Guarantees
 *  - Only the intervention OWNER may authorize (403 otherwise).
 *  - The intervention must be QUOTE_ACCEPTED and carry an ACCEPTED devis
 *    (409 otherwise) — no payment without an agreed price.
 *  - One live authorization per intervention (409 if one is already PENDING).
 *  - platformFeeCents (env PLATFORM_COMMISSION_PCT) + professionalAmountCents
 *    always equal amountCents (model invariant).
 */
export async function authorizePayment(input: {
  interventionId: string;
  customerUserId: string;
}): Promise<ReturnType<typeof serializePayment>> {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError({
      status: 503,
      code: "PAYMENTS_DISABLED",
      message: "Payments are disabled on this deployment",
    });
  }

  const interventionOid = toObjectId(input.interventionId);
  const now = new Date();

  const intervention = await Intervention.findOne({
    _id: interventionOid,
  })
    .select("status customer professional currency")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }
  if (String(intervention.customer) !== input.customerUserId) {
    throw AppError.forbidden(
      "Only the intervention owner can authorize the payment"
    );
  }
  if (intervention.status !== InterventionStatus.QUOTE_ACCEPTED) {
    throw AppError.conflict(
      `Payments require an accepted devis (intervention is ${intervention.status})`
    );
  }
  if (!intervention.professional) {
    throw AppError.conflict("Intervention has no assigned provider");
  }

  // The authoritative amount is the most recent ACCEPTED devis.
  const acceptedQuote = await Quote.findOne({
    intervention: interventionOid,
    status: QuoteStatus.ACCEPTED,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!acceptedQuote) {
    throw AppError.conflict("No accepted devis to charge");
  }

  const existing = await Payment.findOne({
    intervention: interventionOid,
    status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
  }).lean();
  if (existing) {
    throw AppError.conflict("A payment authorization is already in flight");
  }

  const amountCents = acceptedQuote.totalAmountCents;
  const platformFeeCents = Math.round(
    (amountCents * env.PLATFORM_COMMISSION_PCT) / 100
  );
  const professionalAmountCents = amountCents - platformFeeCents;
  const expiresAt = new Date(
    now.getTime() + env.PAYMENT_AUTHORIZATION_TTL_DAYS * 24 * 3600 * 1000
  );

  const intent = await getStripeGateway().createManualCaptureIntent({
    amountCents,
    currency: acceptedQuote.currency,
    applicationFeeCents: platformFeeCents,
    metadata: {
      interventionId: input.interventionId,
      quoteId: String(acceptedQuote._id),
    },
    expiresAt,
  });

  const payment = await Payment.create({
    intervention: interventionOid,
    customer: intervention.customer,
    professional: intervention.professional,
    status: PaymentStatus.PENDING,
    amountCents,
    platformFeeCents,
    professionalAmountCents,
    currency: acceptedQuote.currency,
    provider: "stripe",
    providerPaymentId: intent.id,
    authorizationExpiresAt: expiresAt,
  });

  return serializePayment(payment.toObject() as PaymentDoc);
}

/**
 * Capture a previously authorized payment. Called (best-effort) by the
 * lifecycle when the provider completes the intervention. Idempotent: an
 * already-PAID (or CANCELED/FAILED) payment is left untouched.
 */
export async function capturePaymentByIntervention(
  interventionId: string
): Promise<void> {
  const payment = await Payment.findOne({
    intervention: toObjectId(interventionId),
    status: PaymentStatus.PENDING,
    providerPaymentId: { $exists: true, $ne: null },
  }).lean();
  if (!payment) {
    logger.info(
      { interventionId },
      "no live authorization to capture; skipping"
    );
    return;
  }
  const result = await getStripeGateway().captureIntent(
    payment.providerPaymentId!
  );
  await Payment.updateOne(
    { _id: payment._id, status: PaymentStatus.PENDING },
    { $set: { status: PaymentStatus.PAID, paidAt: new Date() } }
  );
  logger.info(
    { paymentId: String(payment._id), captured: result.amountCapturedCents },
    "payment captured"
  );
  await publishPaymentStatus(payment, PaymentStatus.PAID);
}

/**
 * Customer-initiated cancellation of a live authorization (before capture).
 * Owner-only; only PENDING payments can be canceled.
 */
export async function cancelPayment(input: {
  paymentId: string;
  customerUserId: string;
}): Promise<ReturnType<typeof serializePayment>> {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError({
      status: 503,
      code: "PAYMENTS_DISABLED",
      message: "Payments are disabled on this deployment",
    });
  }

  const payment = await Payment.findOne({
    _id: toObjectId(input.paymentId),
  }).lean();
  if (!payment) {
    throw AppError.notFound("Payment");
  }
  if (String(payment.customer) !== input.customerUserId) {
    throw AppError.forbidden("Only the payer can cancel the payment");
  }
  if (payment.status !== PaymentStatus.PENDING) {
    throw AppError.conflict(
      `Payment is ${payment.status}; only PENDING authorizations can be canceled`
    );
  }

  await getStripeGateway().cancelIntent(payment.providerPaymentId!);
  await Payment.updateOne(
    { _id: payment._id, status: PaymentStatus.PENDING },
    { $set: { status: PaymentStatus.CANCELED } }
  );
  const fresh = (await Payment.findById(payment._id).lean())!;
  return serializePayment(fresh as PaymentDoc);
}

/**
 * Handle a verified provider webhook event, idempotently. Returns whether the
 * event was applied, skipped as a replay (duplicate), or irrelevant.
 */
export async function handleProviderEvent(
  event: ProviderEvent
): Promise<"applied" | "duplicate" | "ignored"> {
  if (
    ![
      "payment_intent.captured",
      "payment_intent.canceled",
      "payment_intent.payment_failed",
    ].includes(event.type)
  ) {
    return "ignored";
  }

  try {
    await WebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      type: event.type,
      processedAt: new Date(),
    });
  } catch (err) {
    // Unique key violation → already-processed replay.
    if ((err as { code?: number }).code === 11000) {
      return "duplicate";
    }
    throw err;
  }

  if (!event.paymentIntentId) {
    return "ignored";
  }

  const payment = await Payment.findOne({
    providerPaymentId: event.paymentIntentId,
  }).lean();
  if (!payment) {
    logger.warn(
      { eventId: event.id, paymentIntentId: event.paymentIntentId },
      "webhook for unknown payment intent"
    );
    return "ignored";
  }

  if (event.type === "payment_intent.captured") {
    if (payment.status === PaymentStatus.PENDING) {
      await Payment.updateOne(
        { _id: payment._id, status: PaymentStatus.PENDING },
        { $set: { status: PaymentStatus.PAID, paidAt: new Date() } }
      );
      await publishPaymentStatus(payment, PaymentStatus.PAID);
    }
    return "applied";
  }

  // payment_intent.canceled | payment_intent.payment_failed
  const nextStatus =
    event.type === "payment_intent.canceled"
      ? PaymentStatus.CANCELED
      : PaymentStatus.FAILED;
  if (payment.status === PaymentStatus.PENDING) {
    await Payment.updateOne(
      { _id: payment._id, status: PaymentStatus.PENDING },
      { $set: { status: nextStatus } }
    );
    await publishPaymentStatus(payment, nextStatus);
  }
  return "applied";
}

/** Best-effort SSE fan-out of a payment status change on the intervention channel. */
async function publishPaymentStatus(
  payment: PaymentDoc,
  status: PaymentStatus
): Promise<void> {
  const event: InterventionEvent = {
    type: "intervention.status-changed",
    interventionId: String(payment.intervention),
    data: {
      action: "payment",
      paymentId: String(payment._id),
      status,
      amountCents: payment.amountCents,
      platformFeeCents: payment.platformFeeCents,
      at: new Date().toISOString(),
    },
    emittedAt: new Date().toISOString(),
  };
  await publishInterventionEvent(event);
}
