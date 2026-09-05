import type { ISODateString, ObjectIdString } from "./common";
import { UserRole } from "./enums";
import type { UserRole as LegacyUserRole } from "./legacy/auth";

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

/**
 * Bridge between the legacy auth layer (`user | owner | admin`, still stored
 * on the User document and embedded in JWTs) and the automotive domain roles
 * (`CUSTOMER | PROFESSIONAL | ADMIN`). Automotive modules must use the domain
 * roles; the mapping lives here so it cannot drift per call site.
 */
export function mapLegacyUserRole(role: LegacyUserRole): UserRole {
  switch (role) {
    case "owner":
      return UserRole.PROFESSIONAL;
    case "admin":
      return UserRole.ADMIN;
    case "user":
    default:
      return UserRole.CUSTOMER;
  }
}
