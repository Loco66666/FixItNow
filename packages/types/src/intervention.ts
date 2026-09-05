import type { CurrencyCode, ISODateString, ObjectIdString } from "./common";
import type { InterventionStatus, InterventionUrgency } from "./enums";

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
  professionalId?: ObjectIdString;
  status: InterventionStatus;
  urgency: InterventionUrgency;
  title: string;
  description: string;
  location: InterventionLocation;
  services: string[];
  currency: CurrencyCode;
  requestedAt: ISODateString;
  scheduledAt?: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
