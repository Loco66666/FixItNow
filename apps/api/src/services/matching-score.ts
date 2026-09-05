/**
 * Pure matching-score functions (PHASE 04).
 *
 * The weighted total follows the agreed product specification:
 *   availability 30% / distance 20% / skill 20% / price 10% / rating 10% /
 *   eta 5% / history 5%.
 *
 * Everything here is deterministic and side-effect free so the ordering of
 * candidates can be unit-tested, and so PHASE 11 (AI matching) can later
 * learn new weights against the same components.
 */

export const MATCH_WEIGHTS = {
  availability: 0.3,
  distance: 0.2,
  skill: 0.2,
  price: 0.1,
  rating: 0.1,
  eta: 0.05,
  history: 0.05,
} as const;

/** Market reference rate used to normalize prices: 70 €/h. */
export const REFERENCE_HOURLY_RATE_CENTS = 7_000;

/** Beyond 2 hours of estimated arrival, the ETA component bottoms out. */
const ETA_CAP_MINUTES = 120;

/** Neutral score for unknown components (no rating, no rate, no services). */
const NEUTRAL = 0.5;

/** Availability statuses ranked from best to worst (UNAVAILABLE excluded). */
const AVAILABILITY_SCORE: Record<string, number> = {
  AVAILABLE_NOW: 1,
  AVAILABLE_TODAY: 0.7,
  AVAILABLE_SOON: 0.5,
  APPOINTMENT: 0.3,
  UNAVAILABLE: 0,
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in kilometers between two coordinates. */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Estimated arrival in minutes: ~30 km/h urban driving + 5 min dispatch. */
export function etaMinutesFor(distanceKm: number): number {
  return Math.round(distanceKm * 2 + 5);
}

export interface ScoreProviderInput {
  distanceKm: number;
  /** Coverage radius used to normalize the distance score ([0, 1]). */
  radiusKm: number;
  hourlyRateCents?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  /** Availability statuses of the provider (best one wins). */
  availabilityStatuses: string[];
  matchedSkillCount: number;
  /** Number of intervention services considered (0 → neutral skill score). */
  totalSkillCount: number;
  completedInterventions: number;
}

export interface ScoreProviderResult {
  score: number;
  distanceScore: number;
  etaScore: number;
  etaMinutes: number;
  skillScore: number;
  availabilityScore: number;
  priceScore: number;
  ratingScore: number;
  historyScore: number;
}

export function scoreProvider(input: ScoreProviderInput): ScoreProviderResult {
  const radius = Math.max(input.radiusKm, 0.001);
  const distanceScore = 1 - Math.min(input.distanceKm / radius, 1);

  const etaMinutes = etaMinutesFor(input.distanceKm);
  const etaScore = 1 - Math.min(etaMinutes / ETA_CAP_MINUTES, 1);

  const availabilityScore = input.availabilityStatuses.length
    ? Math.max(
        ...input.availabilityStatuses.map((s) => AVAILABILITY_SCORE[s] ?? 0)
      )
    : 0;

  const skillScore =
    input.totalSkillCount > 0
      ? input.matchedSkillCount / input.totalSkillCount
      : NEUTRAL;

  const priceScore =
    input.hourlyRateCents == null
      ? NEUTRAL
      : input.hourlyRateCents <= REFERENCE_HOURLY_RATE_CENTS
        ? 1
        : REFERENCE_HOURLY_RATE_CENTS / input.hourlyRateCents;

  const ratingScore =
    input.ratingCount != null &&
    input.ratingCount > 0 &&
    input.ratingAvg != null
      ? Math.max(0, Math.min(input.ratingAvg / 5, 1))
      : NEUTRAL;

  const historyScore =
    input.completedInterventions > 0
      ? Math.min(input.completedInterventions / 10, 1)
      : NEUTRAL;

  const total =
    MATCH_WEIGHTS.availability * availabilityScore +
    MATCH_WEIGHTS.distance * distanceScore +
    MATCH_WEIGHTS.skill * skillScore +
    MATCH_WEIGHTS.price * priceScore +
    MATCH_WEIGHTS.rating * ratingScore +
    MATCH_WEIGHTS.eta * etaScore +
    MATCH_WEIGHTS.history * historyScore;

  return {
    score: Math.round(total * 1000) / 10,
    distanceScore,
    etaScore,
    etaMinutes,
    skillScore,
    availabilityScore,
    priceScore,
    ratingScore,
    historyScore,
  };
}
