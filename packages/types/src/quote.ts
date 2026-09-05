import type { CurrencyCode, ISODateString, ObjectIdString } from "./common";
import type { QuoteStatus } from "./enums";

export interface QuoteItem {
  id: ObjectIdString;
  quoteId: ObjectIdString;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Quote {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  professionalId: ObjectIdString;
  status: QuoteStatus;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: CurrencyCode;
  validUntil?: ISODateString;
  notes?: string;
  items: QuoteItem[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
