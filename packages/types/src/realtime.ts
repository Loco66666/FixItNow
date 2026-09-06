import type { ISODateString, ObjectIdString } from "./common";
import type { ProviderRealtimeStatus } from "./enums";

/** Current geo position of a provider (tracking stream, PHASE 05+). */
export interface ProviderLocation {
  providerId: ObjectIdString;
  coordinates: [number, number];
  accuracyMeters?: number;
  status: ProviderRealtimeStatus;
  updatedAt: ISODateString;
}

/** One row kept per professional: the real-time (non-declared) status. */
export interface ProviderRealtimeStatusSnapshot {
  professionalId: ObjectIdString;
  status: ProviderRealtimeStatus;
  updatedAt: ISODateString;
}

/** Domain events pushed over the intervention SSE channel. */
export type InterventionEventType =
  | "intervention.accepted"
  | "intervention.status-changed";

export interface InterventionEvent {
  type: InterventionEventType;
  interventionId: ObjectIdString;
  data: Record<string, unknown>;
  emittedAt: ISODateString;
}
