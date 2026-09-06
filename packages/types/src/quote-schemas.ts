import { z } from "zod";

/**
 * Shared Zod contracts for the quotes module (API <-> web <-> CLI).
 * Single source of truth so the wire contract cannot drift.
 */

export const quoteItemKindEnum = ["part", "labor", "service"] as const;

/** Input payload from the professional when creating a devis. */
export const createQuoteItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(5, "Description trop courte")
    .max(500, "Description trop longue"),
  quantity: z.coerce.number().int().min(1, "Quantité minimum 1"),
  unit_price: z.coerce.number().int().min(0, "Prix unitaire ≥ 0"),
  tax_rate: z.coerce.number().min(0, "TVA ≥ 0").max(0.2, "TVA ≤ 20%"),
  kind: z.enum(quoteItemKindEnum).optional(),
});

export const createQuoteSchema = z.object({
  items: z
    .array(createQuoteItemSchema)
    .min(1, "Au moins un poste de dépense requis")
    .max(50, "Maximum 50 postes"),
  notes: z.string().trim().max(5000, "Notes trop longues").optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

export const quoteItemTaxRateEnum = ["0", "0.055", "0.1", "0.2"] as const;

/** QuoteItem as persisted by Mongoose (totalCents = HT, before tax). */
export const quoteItemPersistedSchema = z.object({
  description: z.string().trim(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  taxRate: z.number().min(0).max(0.2).optional(),
  kind: z.enum(quoteItemKindEnum).optional(),
});

/** QuoteStatus tel que exposé par l'API. */
export const quoteStatusEnum = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const quoteSchema = z.object({
  id: z.string(),
  interventionId: z.string(),
  professionalId: z.string(),
  items: z.array(quoteItemPersistedSchema),
  status: z.enum(quoteStatusEnum),
  subtotalCents: z.number().int().min(0),
  taxAmountCents: z.number().int().min(0),
  totalAmountCents: z.number().int().min(0),
  currency: z.string().length(3),
  validUntil: z.date().nullish(),
  notes: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type QuoteItemInput = z.infer<typeof createQuoteItemSchema>;
export type QuoteInput = z.infer<typeof createQuoteSchema>;
export type QuoteItemPersisted = z.infer<typeof quoteItemPersistedSchema>;
export type QuotePersisted = z.infer<typeof quoteSchema>;
