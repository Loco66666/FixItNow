import type { ISODateString, ObjectIdString } from "./common";
import type { AvailabilityStatus } from "./enums";

export interface Availability {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  status: AvailabilityStatus;
  startAt?: ISODateString;
  endAt?: ISODateString;
  timezone: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
