import type { ISODateString, ObjectIdString } from "./common";
import type { ProfessionalType, VerificationStatus } from "./enums";

export interface ProfessionalLocation {
  latitude: number;
  longitude: number;
}

export interface Professional {
  id: ObjectIdString;
  userId: ObjectIdString;
  type: ProfessionalType;
  displayName: string;
  phone?: string;
  description?: string;
  yearsExperience?: number;
  serviceRadiusKm: number;
  verificationStatus: VerificationStatus;
  location?: ProfessionalLocation;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
