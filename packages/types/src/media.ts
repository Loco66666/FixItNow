import type { ISODateString, ObjectIdString } from "./common";

export interface Media {
  id: ObjectIdString;
  ownerId: ObjectIdString;
  interventionId?: ObjectIdString;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  purpose: "PROBLEM" | "BEFORE" | "AFTER" | "QUOTE" | "DOCUMENT";
  storageKey: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  url?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
