import type { ISODateString, ObjectIdString } from "./common";
import type { MessageType } from "./enums";

export interface Message {
  id: ObjectIdString;
  conversationId: ObjectIdString;
  senderId: ObjectIdString;
  type: MessageType;
  content?: string;
  mediaId?: ObjectIdString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
