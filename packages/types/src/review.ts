import type { ISODateString, ObjectIdString } from "./common";

export interface Review {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  customerId: ObjectIdString;
  professionalId: ObjectIdString;
  rating: number;
  comment?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
