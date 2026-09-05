import type { ISODateString, ObjectIdString } from "./common";

export interface ServiceArea {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  name: string;
  center: {
    latitude: number;
    longitude: number;
  };
  radiusKm: number;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
