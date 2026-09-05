import type { ISODateString, ObjectIdString } from "./common";

export interface Garage {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  name: string;
  legalName?: string;
  registrationNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  phone?: string;
  email?: string;
  website?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
