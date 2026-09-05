import type { ISODateString, ObjectIdString } from "./common";

export interface Skill {
  id: ObjectIdString;
  name: string;
  description?: string;
  category?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ProfessionalSkill {
  id: ObjectIdString;
  professionalId: ObjectIdString;
  skillId: ObjectIdString;
  yearsExperience?: number;
  isVerified: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
