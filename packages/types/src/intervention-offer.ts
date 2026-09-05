import type { ISODateString, ObjectIdString } from "./common";
import type { InterventionOfferStatus } from "./enums";

export interface InterventionOffer {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  professionalId: ObjectIdString;
  status: InterventionOfferStatus;
  offeredAt: ISODateString;
  expiresAt: ISODateString;
  respondedAt?: ISODateString;
  estimatedArrivalAt?: ISODateString;
  estimatedPayoutCents: number;
  currency: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
