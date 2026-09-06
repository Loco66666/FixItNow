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

export interface DecideQuoteInput {
  interventionId: string;
  quoteId: string;
  customerUserId: string;
  decision: "accept" | "reject";
}

export interface DecideQuoteResult {
  interventionId: string;
  quoteId: string;
  decision: "accept" | "reject";
  previousStatus: InterventionStatus;
  status: InterventionStatus;
  quoteStatus: string;
}

/**
 * Customer decision (accept | reject) on a devis of their intervention.
 *
 * Guarantees
 *  - Only the intervention OWNER may decide (403 otherwise) — a pro, an admin
 *    or another customer cannot touch someone else's devis.
 *  - The intervention MUST be in QUOTE_PENDING (state-machine 409 otherwise).
 *  - accept: intervention → QUOTE_ACCEPTED + quote → ACCEPTED. The provider
 *    can then start work (QUOTE_ACCEPTED → IN_PROGRESS).
 *  - reject: intervention → back to DIAGNOSING (revised devis possible) and
 *    quote → REJECTED.
 *  - The status flip is a single compare-&-swap (`status: QUOTE_PENDING`), so
 *    a racing provider action or a double decision cannot double-apply → 409.
 */
export async function decideQuote(
  input: DecideQuoteInput
): Promise<DecideQuoteResult> {
  const interventionOid = toObjectId(input.interventionId);
  const quoteOid = toObjectId(input.quoteId);
  const now = new Date();
  const accepting = input.decision === "accept";

  const intervention = await Intervention.findOne({
    _id: interventionOid,
  })
    .select("status customer")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }
  if (String(intervention.customer) !== input.customerUserId) {
    throw AppError.forbidden(
      "Only the intervention owner can decide on its devis"
    );
  }

  const quote = await Quote.findOne({
    _id: quoteOid,
    intervention: interventionOid,
  }).lean();
  if (!quote) {
    throw AppError.notFound("Quote");
  }

  const previousStatus = intervention.status as InterventionStatus;
  const nextStatus = accepting
    ? InterventionStatus.QUOTE_ACCEPTED
    : InterventionStatus.DIAGNOSING;
  assertTransition(previousStatus, nextStatus, "customer");

  // Atomic compare-&-swap on the intervention status.
  const updated = await Intervention.findOneAndUpdate(
    { _id: interventionOid, status: InterventionStatus.QUOTE_PENDING },
    { $set: { status: nextStatus } },
    { new: true }
  )
    .select("status")
    .lean();
  if (!updated) {
    throw AppError.conflict(
      `Intervention is no longer in status ${InterventionStatus.QUOTE_PENDING}`
    );
  }

  // Flip the quote row (only while still SENT — a second decision loses the CAS).
  const quoteStatus = accepting ? QuoteStatus.ACCEPTED : QuoteStatus.REJECTED;
  await Quote.updateOne(
    { _id: quoteOid, status: QuoteStatus.SENT },
    { $set: { status: quoteStatus } }
  );

  // Audit trail (best-effort).
  try {
    await InterventionStatusHistory.create({
      intervention: interventionOid,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      actor: new Types.ObjectId(input.customerUserId),
      reason: accepting
        ? "Customer accepted the devis"
        : "Customer rejected the devis",
    });
  } catch {
    // audit log is best-effort
  }

  // Real-time fan-out (best-effort).
  await publishInterventionEvent({
    type: accepting
      ? "intervention.quote.accepted"
      : "intervention.quote.rejected",
    interventionId: interventionOid.toHexString(),
    data: {
      quoteId: quoteOid.toHexString(),
      by: input.customerUserId,
      at: now.toISOString(),
    },
    emittedAt: now.toISOString(),
  });
  await publishInterventionEvent({
    type: "intervention.status-changed",
    interventionId: interventionOid.toHexString(),
    data: {
      action: accepting ? "accept-quote" : "reject-quote",
      from: previousStatus,
      to: nextStatus,
      quoteId: quoteOid.toHexString(),
      at: now.toISOString(),
    },
    emittedAt: now.toISOString(),
  });

  return {
    interventionId: interventionOid.toHexString(),
    quoteId: quoteOid.toHexString(),
    decision: input.decision,
    previousStatus,
    status: nextStatus,
    quoteStatus,
  };
}

export interface InterventionQuoteSummary {
  quoteId: string;
  status: string;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: string;
  notes?: string;
  validUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    taxRate?: number;
    kind?: string;
  }>;
}

/**
 * List the devis of one intervention, newest first, with their line items.
 *
 * Multi-tenant guard: only the CUSTOMER who owns the intervention or the
 * ASSIGNED professional may see its quotes (403 for anyone else, including
 * another customer or an unassigned pro).
 */
export async function listInterventionQuotes(
  interventionId: string,
  callerUserId: string
): Promise<InterventionQuoteSummary[]> {
  const interventionOid = toObjectId(interventionId);

  const intervention = await Intervention.findOne({
    _id: interventionOid,
  })
    .select("customer professional")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }

  // Resolve the caller's professional row (if any) to compare against the
  // assigned provider. A customer simply has no Professional document.
  const professional = await Professional.findOne({
    user: new Types.ObjectId(callerUserId),
  })
    .select("_id")
    .lean();

  const isOwner = String(intervention.customer) === String(callerUserId);
  const isAssignedPro =
    !!professional &&
    !!intervention.professional &&
    String(intervention.professional) === String(professional._id);
  if (!isOwner && !isAssignedPro) {
    throw AppError.forbidden(
      "Only the intervention owner or its assigned provider can list the devis"
    );
  }

  const quotes = await Quote.find({ intervention: interventionOid })
    .sort({ createdAt: -1 })
    .lean();

  // Fan out the line items per quote (quotes hold their items as ObjectIds).
  const quoteIds = quotes.map((q) => q._id);
  const items = await QuoteItem.find({ quote: { $in: quoteIds } })
    .sort({ createdAt: 1 })
    .lean();
  const itemsByQuote = new Map<string, Array<(typeof items)[number]>>();
  for (const it of items) {
    const key = String(it.quote);
    const bucket = itemsByQuote.get(key) ?? [];
    bucket.push(it);
    itemsByQuote.set(key, bucket);
  }

  return quotes.map((q) => ({
    quoteId: q._id.toString(),
    status: q.status,
    subtotalCents: q.subtotalCents,
    taxAmountCents: q.taxAmountCents,
    totalAmountCents: q.totalAmountCents,
    currency: q.currency,
    notes: q.notes,
    validUntil: q.validUntil,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    items: (itemsByQuote.get(String(q._id)) ?? []).map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      totalCents: it.totalCents,
      taxRate: it.taxRate,
      kind: it.kind,
    })),
  }));
}

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid interventionId");
  }
  return new Types.ObjectId(value);
}
