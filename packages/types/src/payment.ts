import type { CurrencyCode, ISODateString, ObjectIdString } from "./common";
import type { PaymentStatus } from "./enums";

export interface Payment {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  customerId: ObjectIdString;
  professionalId: ObjectIdString;
  status: PaymentStatus;
  amountCents: number;
  platformFeeCents: number;
  professionalAmountCents: number;
  refundedAmountCents: number;
  currency: CurrencyCode;
  provider: string;
  providerPaymentId?: string;
  paidAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
