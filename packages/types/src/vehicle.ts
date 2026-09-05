import type { ISODateString, ObjectIdString } from "./common";

export interface Vehicle {
  id: ObjectIdString;
  ownerId: ObjectIdString;
  registrationNumber: string;
  make: string;
  model: string;
  year?: number;
  fuelType?: string;
  engine?: string;
  mileageKm?: number;
  vin?: string;
  color?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
