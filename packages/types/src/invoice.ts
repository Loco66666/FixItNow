import type { CurrencyCode, ISODateString, ObjectIdString } from "./common";

export interface Invoice {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  customerId: ObjectIdString;
  professionalId: ObjectIdString;
  invoiceNumber: string;
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  currency: CurrencyCode;
  issuedAt: ISODateString;
  dueAt?: ISODateString;
  paidAt?: ISODateString;
  pdfUrl?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
