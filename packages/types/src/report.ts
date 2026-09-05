import type { ISODateString, ObjectIdString } from "./common";

export interface InterventionReport {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  professionalId: ObjectIdString;
  summary: string;
  workPerformed: string;
  findings?: string;
  recommendations?: string;
  beforeMediaIds: ObjectIdString[];
  afterMediaIds: ObjectIdString[];
  customerValidatedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
