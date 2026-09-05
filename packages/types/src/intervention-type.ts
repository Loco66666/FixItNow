import type { ISODateString, ObjectIdString } from "./common";

export interface InterventionType {
  id: ObjectIdString;
  name: string;
  slug: string;
  description?: string;
  /** Whether customers can select this entry from the catalog. */
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
