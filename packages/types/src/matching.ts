import type { ISODateString, ObjectIdString } from "./common";
import type { MatchCandidateStatus } from "./enums";

/**
 * One provider candidate for an intervention, produced by the matching
 * engine. Component scores are stored alongside the weighted total so the
 * "why was this provider proposed?" question always has an answer — and so
 * the AI matching (PHASE 11) can learn from recorded outcomes.
 *
 * All component scores are in [0, 1]; `score` is the weighted total in [0, 100]
 * (weights: availability 30%, distance 20%, skill 20%, price 10%, rating 10%,
 * eta 5%, history 5%).
 */
export interface MatchingCandidate {
  id: ObjectIdString;
  interventionId: ObjectIdString;
  professionalId: ObjectIdString;
  status: MatchCandidateStatus;
  score: number;
  distanceKm: number;
  etaMinutes: number;
  skillScore: number;
  availabilityScore: number;
  priceScore: number;
  ratingScore: number;
  etaScore: number;
  historyScore: number;
  expiresAt: ISODateString;
  acceptedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
