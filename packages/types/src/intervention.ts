import type { ISODateString, ObjectIdString } from "./common";
import type { InterventionStatus } from "./enums";

export interface InterventionLocation {
  address: string;
  city?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
}

export interface Intervention {
  id: ObjectIdString;
  customerId: ObjectIdString;
  vehicleId: ObjectIdString;
  status: InterventionStatus;
  title: string;
  description: string;
  location: InterventionLocation;
  requestedAt: ISODateString;
  scheduledAt?: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
