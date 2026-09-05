import type { ISODateString, ObjectIdString } from "./common";

export interface Conversation {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  customerId: ObjectIdString;
  professionalId: ObjectIdString;
  lastMessageAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
