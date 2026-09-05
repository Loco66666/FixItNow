import { Types } from "mongoose";
import {
  AvailabilityStatus,
  InterventionStatus,
  MatchCandidateStatus,
  VerificationStatus,
} from "@fixitnow/types";

import { Intervention } from "../models/automotive/Intervention";
import { Professional } from "../models/automotive/Professional";
import { ServiceArea } from "../models/automotive/ServiceArea";
import { Availability } from "../models/automotive/Availability";
import { Review } from "../models/automotive/Review";
import { ProfessionalSkill } from "../models/automotive/ProfessionalSkill";
import { MatchingCandidate } from "../models/automotive/MatchingCandidate";
import { AppError } from "../utils/AppError";
import { haversineKm, scoreProvider } from "./matching-score";
import type { ScoreProviderResult } from "./matching-score";

const MATCHABLE_STATUSES = [
  InterventionStatus.REQUESTED,
  InterventionStatus.SEARCHING,
];

// Regulated attendance: only authorized providers may take these jobs.
const HIGHWAY_CONTEXTS = new Set(["HIGHWAY", "EXPRESS_ROAD"]);

const CANDIDATE_TTL_MINUTES = 15;
const MAX_CANDIDATES = 20;

function toObjectId(value: string, field: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest(`Invalid ${field}`);
  }
  return new Types.ObjectId(value);
}

/** Normalize a professional's skills into lowercase searchable keywords. */
function skillKeywordsFor(skills: { name: string; code: string }[]): string[] {
  const keywords = new Set<string>();
  for (const s of skills) {
    const name = s.name.trim().toLowerCase();
    const code = s.code.trim().toLowerCase();
    if (name.length >= 3) keywords.add(name);
    if (code.length >= 3) keywords.add(code);
  }
  return [...keywords];
}

/** How many of the intervention's free-text services match the keywords. */
function matchedServiceCount(services: string[], keywords: string[]): number {
  if (services.length === 0 || keywords.length === 0) return 0;
  let matched = 0;
  for (const service of services) {
    const s = service.trim().toLowerCase();
    if (s.length < 3) continue;
    if (keywords.some((k) => k.includes(s) || s.includes(k))) matched += 1;
  }
  return matched;
}

async function supersedePending(
  interventionId: Types.ObjectId,
  keepProfessionalIds: Types.ObjectId[]
) {
  const filter: Record<string, unknown> = {
    intervention: interventionId,
    status: MatchCandidateStatus.PENDING,
  };
  if (keepProfessionalIds.length > 0) {
    filter.professional = { $nin: keepProfessionalIds };
  }
  await MatchingCandidate.updateMany(filter, {
    $set: { status: MatchCandidateStatus.SUPERSEDED },
  });
}

export async function runMatchingForIntervention(
  interventionId: string,
  customerId: string
) {
  const interventionOid = toObjectId(interventionId, "interventionId");
  const customerOid = toObjectId(customerId, "customerId");

  const intervention = await Intervention.findOne({
    _id: interventionOid,
    customer: customerOid,
  });
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }

  if (!MATCHABLE_STATUSES.includes(intervention.status)) {
    throw AppError.conflict(
      `Matching is only available for interventions in status ${MATCHABLE_STATUSES.join(" or ")} (current: ${intervention.status}).`
    );
  }

  // --- Hard exclusions -----------------------------------------------------
  const filter: Record<string, unknown> = {
    isActive: true,
    verificationStatus: VerificationStatus.APPROVED,
  };
  if (HIGHWAY_CONTEXTS.has(intervention.locationContext)) {
    filter.isHighwayAuthorized = true;
  }

  const professionals = await Professional.find(filter).limit(200);
  if (professionals.length === 0) {
    await supersedePending(intervention._id, []);
    return [];
  }
  const proIds = professionals.map((p) => p._id);

  // --- Component data ------------------------------------------------------
  const [availabilities, reviewAgg, completedAgg, proSkills, serviceAreas] =
    await Promise.all([
      Availability.find({
        professional: { $in: proIds },
        status: { $ne: AvailabilityStatus.UNAVAILABLE },
      })
        .select("professional status")
        .lean(),
      Review.aggregate<{ _id: Types.ObjectId; avg: number; count: number }>([
        { $match: { professional: { $in: proIds } } },
        {
          $group: {
            _id: "$professional",
            avg: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]),
      Intervention.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            professional: { $in: proIds },
            status: InterventionStatus.COMPLETED,
          },
        },
        { $group: { _id: "$professional", count: { $sum: 1 } } },
      ]),
      ProfessionalSkill.find({ professional: { $in: proIds }, isActive: true })
        .populate<{ skill: { name: string; code: string } | null }>(
          "skill",
          "name code"
        )
        .lean(),
      ServiceArea.find({ professional: { $in: proIds }, isActive: true })
        .select("professional center radiusKm")
        .lean(),
    ]);

  const availabilityByPro = new Map<string, string[]>();
  for (const a of availabilities) {
    const key = String(a.professional);
    availabilityByPro.set(key, [
      ...(availabilityByPro.get(key) ?? []),
      a.status,
    ]);
  }

  const ratingsByPro = new Map(
    reviewAgg.map((r) => [String(r._id), r] as const)
  );

  const completedByPro = new Map(
    completedAgg.map((c) => [String(c._id), c.count] as const)
  );

  const skillsByPro = new Map<string, { name: string; code: string }[]>();
  for (const ps of proSkills) {
    const key = String(ps.professional);
    const skill = ps.skill;
    if (!skill?.name || !skill?.code) continue;
    skillsByPro.set(key, [
      ...(skillsByPro.get(key) ?? []),
      { name: skill.name, code: skill.code },
    ]);
  }

  const areasByPro = new Map<
    string,
    { lng: number; lat: number; radiusKm: number }[]
  >();
  for (const area of serviceAreas) {
    const key = String(area.professional);
    areasByPro.set(key, [
      ...(areasByPro.get(key) ?? []),
      {
        lng: area.center.coordinates[0],
        lat: area.center.coordinates[1],
        radiusKm: area.radiusKm,
      },
    ]);
  }

  // --- Score & persist ------------------------------------------------------
  const [lng, lat] = intervention.location.coordinates;
  const scored: {
    professional: Types.ObjectId;
    result: ScoreProviderResult;
    distanceKm: number;
  }[] = [];

  for (const pro of professionals) {
    const key = String(pro._id);

    // Availability is the #1 signal (30% of the score): a provider with no
    // positive availability (UNAVAILABLE only, or nothing declared) is never
    // proposed — the product promise is "who is actually available now".
    const availabilityStatuses = availabilityByPro.get(key) ?? [];
    if (availabilityStatuses.length === 0) continue;

    // Coverage positions: own location first, then declared service areas.
    const positions: { lng: number; lat: number; radiusKm: number }[] = [];
    if (pro.location) {
      positions.push({
        lng: pro.location.coordinates[0],
        lat: pro.location.coordinates[1],
        radiusKm: pro.serviceRadiusKm,
      });
    }
    positions.push(...(areasByPro.get(key) ?? []));
    if (positions.length === 0) continue;

    // Keep the nearest position that actually covers the intervention.
    let best: { distanceKm: number; radiusKm: number } | null = null;
    for (const pos of positions) {
      const d = haversineKm(
        { latitude: lat, longitude: lng },
        { latitude: pos.lat, longitude: pos.lng }
      );
      if (d > pos.radiusKm) continue;
      if (!best || d < best.distanceKm) {
        best = { distanceKm: d, radiusKm: pos.radiusKm };
      }
    }
    if (!best) continue; // out of all coverage

    const keywords = skillKeywordsFor(skillsByPro.get(key) ?? []);
    const result = scoreProvider({
      distanceKm: best.distanceKm,
      radiusKm: best.radiusKm,
      hourlyRateCents: pro.hourlyRateCents ?? null,
      ratingAvg: ratingsByPro.get(key)?.avg ?? null,
      ratingCount: ratingsByPro.get(key)?.count ?? null,
      availabilityStatuses,
      matchedSkillCount: matchedServiceCount(intervention.services, keywords),
      totalSkillCount: intervention.services.length,
      completedInterventions: completedByPro.get(key) ?? 0,
    });

    scored.push({
      professional: pro._id,
      result,
      distanceKm: Math.round(best.distanceKm * 10) / 10,
    });
  }

  scored.sort((a, b) => b.result.score - a.result.score);
  const selected = scored.slice(0, MAX_CANDIDATES);

  const expiresAt = new Date(Date.now() + CANDIDATE_TTL_MINUTES * 60_000);

  await Promise.all(
    selected.map((s) =>
      MatchingCandidate.updateOne(
        { intervention: intervention._id, professional: s.professional },
        {
          $set: {
            status: MatchCandidateStatus.PENDING,
            score: s.result.score,
            distanceKm: s.distanceKm,
            etaMinutes: s.result.etaMinutes,
            skillScore: s.result.skillScore,
            availabilityScore: s.result.availabilityScore,
            priceScore: s.result.priceScore,
            ratingScore: s.result.ratingScore,
            etaScore: s.result.etaScore,
            historyScore: s.result.historyScore,
            expiresAt,
          },
        },
        { upsert: true }
      )
    )
  );

  // Candidates from a previous run that dropped out of the new selection.
  await supersedePending(
    intervention._id,
    selected.map((s) => s.professional)
  );

  return MatchingCandidate.find({ intervention: intervention._id }).sort({
    score: -1,
    createdAt: -1,
  });
}

/** Sorted (best first) candidates of an intervention, owner only. */
export async function listMatchingCandidates(
  interventionId: string,
  customerId: string
) {
  const interventionOid = toObjectId(interventionId, "interventionId");
  const customerOid = toObjectId(customerId, "customerId");

  const exists = await Intervention.exists({
    _id: interventionOid,
    customer: customerOid,
  });
  if (!exists) {
    throw AppError.notFound("Intervention");
  }

  return MatchingCandidate.find({ intervention: interventionOid }).sort({
    score: -1,
    createdAt: -1,
  });
}
