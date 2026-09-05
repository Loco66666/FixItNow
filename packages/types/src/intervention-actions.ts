import type { ISODateString, ObjectIdString } from "./common";

export interface AcceptInterventionAction {
  interventionId: ObjectIdString;
  respondedAt: ISODateString;
}

export interface DeclineInterventionAction {
  interventionId: ObjectIdString;
  reason?: string;
  respondedAt: ISODateString;
}

export interface StartRouteAction {
  interventionId: ObjectIdString;
  startedAt: ISODateString;
}

export interface ArriveInterventionAction {
  interventionId: ObjectIdString;
  arrivedAt: ISODateString;
}

export interface StartDiagnosisAction {
  interventionId: ObjectIdString;
  startedAt: ISODateString;
}

export interface CompleteInterventionAction {
  interventionId: ObjectIdString;
  completedAt: ISODateString;
}
