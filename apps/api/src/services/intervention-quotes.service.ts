import { Types } from "mongoose";
import {
  InterventionStatus,
  QuoteStatus,
  type InterventionEvent,
} from "@fixitnow/types";

import { logger } from "../config/logger";
import { Intervention } from "../models/automotive/Intervention";
import { InterventionStatusHistory } from "../models/automotive/InterventionStatusHistory";
import { Professional } from "../models/automotive/Professional";
import { Quote } from "../models/automotive/Quote";
import { QuoteItem } from "../models/automotive/QuoteItem";
import { AppError } from "../utils/AppError";
import { assertTransition } from "./intervention-state";
import { publishInterventionEvent } from "./intervention-events";

export interface QuoteItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  kind?: "part" | "labor" | "service";
}

export interface CreateQuoteInput {
  interventionId: string;
  professionalUserId: string;
  items: QuoteItemInput[];
  notes?: string;
  currency?: string;
}

export interface CreateQuoteResult {
  interventionId: string;
  quoteId: string;
  status: string;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    taxRate: number;
    kind?: string;
  }>;
  nextStatus: InterventionStatus;
}

/**
 * Create a provider quote (devis) on an intervention the caller is assigned to.
 *
 * Guarantees
 *  - Only the assigned professional may quote (403 otherwise).
 *  - The intervention MUST be in DIAGNOSING (state-machine 409 otherwise).
 *  - The status flip DIAGNOSING → QUOTE_PENDING is a single compare-&-swap
 *    (`status: DIAGNOSING` in the filter), so a concurrent action or customer
 *    cancellation cannot double-apply → 409 on race.
 *  - Quote + items + history + SSE are best-effort; the compare-&-swap on the
 *    intervention remains the source of truth.
 */
export async function createQuote(
  input: CreateQuoteInput
): Promise<CreateQuoteResult> {
  const interventionOid = toObjectId(input.interventionId);
  const professionalUserId = input.professionalUserId;
  const now = new Date();

  const professional = await Professional.findOne({
    user: new Types.ObjectId(professionalUserId),
    isActive: true,
  })
    .select("_id")
    .lean();
  if (!professional) {
    throw AppError.forbidden(
      "You are not registered as an active professional"
    );
  }
  const proId = professional._id;

  const intervention = await Intervention.findOne({
    _id: interventionOid,
  })
    .select("status professional")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }
  if (
    !intervention.professional ||
    String(intervention.professional) !== String(proId)
  ) {
    throw AppError.forbidden(
      "Only the assigned provider can quote this intervention"
    );
  }

  const previousStatus = intervention.status as InterventionStatus;
  assertTransition(
    previousStatus,
    InterventionStatus.QUOTE_PENDING,
    "provider"
  );

  // Atomic compare-&-swap: pin DIAGNOSING so a racing lifecycle action or a
  // customer cancellation cannot double-apply.
  const updated = await Intervention.findOneAndUpdate(
    {
      _id: interventionOid,
      status: InterventionStatus.DIAGNOSING,
      professional: proId,
    },
    { $set: { status: InterventionStatus.QUOTE_PENDING } },
    { new: true }
  )
    .select("status")
    .lean();
  if (!updated) {
    throw AppError.conflict(
      `Intervention is no longer in status ${InterventionStatus.DIAGNOSING}`
    );
  }

  // Persist the quote + items, then aggregate totals (line totals are HT,
  // matching the Mongoose QuoteItem totalCents contract).
  const persistedItems = input.items.map((it) => {
    const unitPriceCents = Math.round(it.unit_price);
    const totalCents = Math.round(unitPriceCents * it.quantity);
    return {
      description: it.description,
      quantity: it.quantity,
      unitPriceCents,
      totalCents,
      taxRate: it.tax_rate,
      kind: it.kind,
    };
  });
  const subtotalCents = persistedItems.reduce(
    (acc, it) => acc + it.totalCents,
    0
  );
  const taxAmountCents = Math.round(
    persistedItems.reduce((acc, it) => acc + it.totalCents * it.taxRate, 0)
  );
  const totalAmountCents = subtotalCents + taxAmountCents;
  const currency = (input.currency ?? "EUR").toUpperCase();

  const quote = await Quote.create({
    intervention: interventionOid,
    professional: proId,
    status: QuoteStatus.SENT,
    subtotalCents,
    taxAmountCents,
    totalAmountCents,
    currency,
    items: [],
    notes: input.notes,
  });

  const quoteItemDocs = await QuoteItem.create(
    persistedItems.map((it) => ({
      quote: quote._id,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      totalCents: it.totalCents,
      taxRate: it.taxRate,
      kind: it.kind,
    }))
  );

  // Best-effort: wire items back to the quote.
  try {
    await Quote.updateOne(
      { _id: quote._id },
      { $addToSet: { items: { $each: quoteItemDocs.map((d) => d._id) } } }
    );
  } catch (err) {
    logger.warn(
      { err: { message: (err as Error)?.message } },
      "quote items wiring failed"
    );
  }

  // Audit trail (best-effort).
  try {
    await InterventionStatusHistory.create({
      intervention: interventionOid,
      fromStatus: previousStatus,
      toStatus: InterventionStatus.QUOTE_PENDING,
      actor: new Types.ObjectId(professionalUserId),
      reason: input.notes ?? "Provider created a devis",
    });
  } catch {
    // audit log is best-effort
  }

  // Real-time fan-out (best-effort): notify the intervention SSE channel.
  const quoteIdHex = (quote._id as Types.ObjectId).toHexString();
  const event: InterventionEvent = {
    type: "intervention.quote.created",
    interventionId: interventionOid.toHexString(),
    data: {
      quoteId: quoteIdHex,
      subtotalCents,
      taxAmountCents,
      totalAmountCents,
      currency,
      itemCount: persistedItems.length,
      at: now.toISOString(),
    },
    emittedAt: now.toISOString(),
  };
  await publishInterventionEvent(event);

  await publishInterventionEvent({
    type: "intervention.status-changed",
    interventionId: interventionOid.toHexString(),
    data: {
      action: "create-quote",
      from: previousStatus,
      to: InterventionStatus.QUOTE_PENDING,
      professionalId: proId.toHexString(),
      ...(input.notes ? { note: input.notes } : {}),
      at: now.toISOString(),
    },
    emittedAt: now.toISOString(),
  });

  return {
    interventionId: interventionOid.toHexString(),
    quoteId: quoteIdHex,
    status: quote.status,
    subtotalCents,
    taxAmountCents,
    totalAmountCents,
    currency,
    items: persistedItems,
    nextStatus: InterventionStatus.QUOTE_PENDING,
  };
}

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid interventionId");
  }
  return new Types.ObjectId(value);
}
