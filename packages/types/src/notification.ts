import type { ISODateString, ObjectIdString } from "./common";
import type { NotificationType } from "./enums";

export interface Notification {
  id: ObjectIdString;
  userId: ObjectIdString;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
