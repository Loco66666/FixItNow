import type { ISODateString, ObjectIdString } from "./common";
import type { UserRole } from "./enums";

export interface User {
  id: ObjectIdString;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
