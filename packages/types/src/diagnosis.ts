import type { ISODateString, ObjectIdString } from "./common";

export interface Diagnosis {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  professionalId: ObjectIdString;
  summary: string;
  findings: string;
  recommendations?: string;
  estimatedDurationMinutes?: number;
  estimatedPartsCostCents?: number;
  estimatedLaborCostCents?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
