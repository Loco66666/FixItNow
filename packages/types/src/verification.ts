import type { ISODateString, ObjectIdString } from "./common";
import type { VerificationDocumentStatus, VerificationStatus } from "./enums";

export interface VerificationDocument {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  type: string;
  status: VerificationDocumentStatus;
  fileId?: ObjectIdString;
  rejectionReason?: string;
  expiresAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ProfessionalVerification {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  status: VerificationStatus;
  submittedAt?: ISODateString;
  reviewedAt?: ISODateString;
  reviewedBy?: ObjectIdString;
  rejectionReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
