import request from "supertest";
import { Types } from "mongoose";
import { useRedisMock } from "./helpers/redis-mock";
import {
  clearCollections,
  connectInMemoryMongo,
  disconnectInMemoryMongo,
} from "./helpers/db";
import { createApp } from "../src/app";
import { makeUser } from "./helpers/auth";
import { Intervention } from "../src/models/automotive/Intervention";
import { Professional } from "../src/models/automotive/Professional";
import { Availability } from "../src/models/automotive/Availability";
import { Skill } from "../src/models/automotive/Skill";
import { ProfessionalSkill } from "../src/models/automotive/ProfessionalSkill";
import { Review } from "../src/models/automotive/Review";
import { MatchingCandidate } from "../src/models/automotive/MatchingCandidate";
import { InterventionStatusHistory } from "../src/models/automotive/InterventionStatusHistory";
import { scoreProvider, MATCH_WEIGHTS } from "../src/services/matching-score";

const app = createApp();

// Limoges city center — every fixture is anchored here for determinism.
const CENTER = { latitude: 45.8336, longitude: 1.2611 };

beforeAll(async () => {
  useRedisMock();
  await connectInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectInMemoryMongo();
});

function offsetPoint(kmNorth: number) {
  // 1° latitude ≈ 111.32 km — deterministic fixture offsets.
  return {
    latitude: CENTER.latitude + kmNorth / 111.32,
    longitude: CENTER.longitude,
  };
}

async function seedProfessional(opts: {
  displayName: string;
  kmNorth?: number;
  isActive?: boolean;
  verified?: boolean;
  highwayAuthorized?: boolean;
  hourlyRateCents?: number;
  availability?: string;
  skillCode?: string;
  skillName?: string;
  ratings?: number[];
  completedCount?: number;
}) {
  const user = await makeUser({ role: "user" });
  const point = offsetPoint(opts.kmNorth ?? 2);

  const pro = await Professional.create({
    user: user.id,
    type: "INDEPENDENT",
    displayName: opts.displayName,
    serviceRadiusKm: 30,
    verificationStatus: opts.verified === false ? "SUBMITTED" : "APPROVED",
    location: { type: "Point", coordinates: [point.longitude, point.latitude] },
    isActive: opts.isActive ?? true,
    isHighwayAuthorized: opts.highwayAuthorized ?? false,
    hourlyRateCents: opts.hourlyRateCents,
  });

  if (opts.availability) {
    await Availability.create({
      professional: pro._id,
      status: opts.availability,
      timezone: "Europe/Paris",
    });
  }

  if (opts.skillCode && opts.skillName) {
    const skill = await Skill.create({
      code: opts.skillCode,
      name: opts.skillName,
    });
    await ProfessionalSkill.create({
      professional: pro._id,
      skill: skill._id,
      experienceLevel: "EXPERT",
    });
  }

  for (const rating of opts.ratings ?? []) {
    await Review.create({
      intervention: new Types.ObjectId(),
      customer: user.id,
      professional: pro._id,
      rating,
    });
  }

  if (opts.completedCount) {
    for (let i = 0; i < opts.completedCount; i += 1) {
      await Intervention.create({
        customer: new Types.ObjectId(),
        vehicle: new Types.ObjectId(),
        professional: pro._id,
        status: "COMPLETED",
        urgency: "NORMAL",
        locationContext: "HOME",
        title: "past job",
        description: "past job",
        location: {
          address: "x",
          coordinates: [CENTER.longitude, CENTER.latitude],
        },
        services: [],
        currency: "EUR",
      });
    }
  }

  return pro;
}

/** Seed a professional whose JWT is minted as `role: "owner"` so the auth
 *  layer maps it to `domainRole: PROFESSIONAL` — i.e. eligible to accept. */
async function seedPro(opts: {
  displayName: string;
  kmNorth?: number;
  availability?: string;
}) {
  const user = await makeUser({ role: "owner" });
  const point = offsetPoint(opts.kmNorth ?? 2);
  const pro = await Professional.create({
    user: user.id,
    type: "INDEPENDENT",
    displayName: opts.displayName,
    serviceRadiusKm: 30,
    verificationStatus: "APPROVED",
    isActive: true,
    isHighwayAuthorized: false,
    location: { type: "Point", coordinates: [point.longitude, point.latitude] },
  });
  if (opts.availability) {
    await Availability.create({
      professional: pro._id,
      status: opts.availability,
      timezone: "Europe/Paris",
    });
  }
  return { pro, accessToken: user.accessToken, userId: user.id };
}

async function seedIntervention(
  customerId: string,
  overrides: Record<string, unknown> = {}
) {
  return Intervention.create({
    customer: customerId,
    vehicle: new Types.ObjectId(),
    status: "REQUESTED",
    urgency: "NORMAL",
    locationContext: "HOME",
    title: "Batterie à plat",
    description: "La voiture ne démarre plus.",
    location: {
      address: "Place de la République",
      city: "Limoges",
      postalCode: "87000",
      coordinates: [CENTER.longitude, CENTER.latitude],
    },
    services: ["Batterie"],
    currency: "EUR",
    ...overrides,
  });
}

describe("scoreProvider (pure)", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("ranks a closer provider higher, all else equal", () => {
    const base = {
      radiusKm: 30,
      availabilityStatuses: ["AVAILABLE_NOW"],
      matchedSkillCount: 1,
      totalSkillCount: 1,
      completedInterventions: 0,
    };
    const near = scoreProvider({ ...base, distanceKm: 2 });
    const far = scoreProvider({ ...base, distanceKm: 25 });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.etaMinutes).toBeLessThan(far.etaMinutes);
  });

  it("rewards AVAILABLE_NOW over APPOINTMENT", () => {
    const base = {
      distanceKm: 5,
      radiusKm: 30,
      matchedSkillCount: 0,
      totalSkillCount: 0,
      completedInterventions: 0,
    };
    const now = scoreProvider({
      ...base,
      availabilityStatuses: ["AVAILABLE_NOW"],
    });
    const later = scoreProvider({
      ...base,
      availabilityStatuses: ["APPOINTMENT"],
    });
    expect(now.score).toBeGreaterThan(later.score);
  });

  it("uses a neutral price score when no rate is known", () => {
    const res = scoreProvider({
      distanceKm: 5,
      radiusKm: 30,
      availabilityStatuses: ["AVAILABLE_NOW"],
      matchedSkillCount: 0,
      totalSkillCount: 0,
      completedInterventions: 0,
    });
    expect(res.priceScore).toBe(0.5);
  });

  it("stays within [0, 100] and rewards a perfect provider", () => {
    const best = scoreProvider({
      distanceKm: 0,
      radiusKm: 30,
      hourlyRateCents: 7000,
      ratingAvg: 5,
      ratingCount: 10,
      availabilityStatuses: ["AVAILABLE_NOW"],
      matchedSkillCount: 1,
      totalSkillCount: 1,
      completedInterventions: 50,
    });
    expect(best.score).toBeLessThanOrEqual(100);
    expect(best.score).toBeGreaterThan(90);
  });
});

describe("POST /interventions/:id/match", () => {
  it("requires authentication", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app).post(
      `/interventions/${intervention._id}/match`
    );
    expect(res.status).toBe(401);
  });

  it("404s when a stranger triggers the matching", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("409s when the intervention is no longer matchable", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id, {
      status: "COMPLETED",
    });

    const res = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("produces deterministic, sorted candidates with a TTL", async () => {
    const owner = await makeUser({ role: "user" });

    // Pro A: 2 km away, available now, has the "Batterie" skill, 4.67 avg.
    const proA = await seedProfessional({
      displayName: "Near Pro",
      kmNorth: 2,
      availability: "AVAILABLE_NOW",
      skillCode: "BATTERIE",
      skillName: "Batterie",
      ratings: [5, 5, 4],
      completedCount: 3,
      hourlyRateCents: 6500,
    });
    // Pro B: 20 km away, same-day availability, no matching skill.
    const proB = await seedProfessional({
      displayName: "Far Pro",
      kmNorth: 20,
      availability: "AVAILABLE_TODAY",
      ratings: [4],
    });

    const intervention = await seedIntervention(owner.id);
    const res = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const candidates = res.body.data;
    expect(candidates).toHaveLength(2);

    expect(candidates[0].professionalId).toBe(String(proA._id));
    expect(candidates[1].professionalId).toBe(String(proB._id));
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
    expect(candidates[0].skillScore).toBe(1);
    // Pro B has no matching skill for the single requested service.
    expect(candidates[1].skillScore).toBe(0);

    for (const c of candidates) {
      expect(c.status).toBe("PENDING");
      expect(new Date(c.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(c.expiresAt).getTime()).toBeLessThanOrEqual(
        Date.now() + 15 * 60_000
      );
    }
  });
});

describe("POST /interventions/:id/match — exclusions & lifecycle", () => {
  it("excludes inactive, unverified, unavailable and out-of-radius pros", async () => {
    const owner = await makeUser({ role: "user" });

    await seedProfessional({
      displayName: "Inactive",
      kmNorth: 2,
      isActive: false,
      availability: "AVAILABLE_NOW",
    });
    await seedProfessional({
      displayName: "Unverified",
      kmNorth: 2,
      verified: false,
      availability: "AVAILABLE_NOW",
    });
    await seedProfessional({
      displayName: "Unavailable",
      kmNorth: 2,
      availability: "UNAVAILABLE",
    });
    await seedProfessional({
      displayName: "TooFar",
      kmNorth: 35,
      availability: "AVAILABLE_NOW",
    });
    const eligible = await seedProfessional({
      displayName: "Eligible",
      kmNorth: 3,
      availability: "AVAILABLE_NOW",
    });

    const intervention = await seedIntervention(owner.id);
    const res = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].professionalId).toBe(String(eligible._id));
  });

  it("only proposes highway-authorized pros for highway interventions", async () => {
    const owner = await makeUser({ role: "user" });

    await seedProfessional({
      displayName: "NotAuthorized",
      kmNorth: 2,
      availability: "AVAILABLE_NOW",
    });
    const authorized = await seedProfessional({
      displayName: "Authorized",
      kmNorth: 3,
      availability: "AVAILABLE_NOW",
      highwayAuthorized: true,
    });

    const intervention = await seedIntervention(owner.id, {
      locationContext: "HIGHWAY",
    });
    const res = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].professionalId).toBe(String(authorized._id));
  });

  it("is idempotent: re-running supersedes stale candidates, no duplicates", async () => {
    const owner = await makeUser({ role: "user" });

    const proA = await seedProfessional({
      displayName: "StaysEligible",
      kmNorth: 2,
      availability: "AVAILABLE_NOW",
    });
    const proB = await seedProfessional({
      displayName: "BecomesUnavailable",
      kmNorth: 4,
      availability: "AVAILABLE_NOW",
    });

    const intervention = await seedIntervention(owner.id);
    const first = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(first.body.data).toHaveLength(2);

    // Pro B goes unavailable, a newcomer joins the pool.
    await Availability.updateOne(
      { professional: proB._id },
      { status: "UNAVAILABLE" }
    );
    const proC = await seedProfessional({
      displayName: "Newcomer",
      kmNorth: 5,
      availability: "AVAILABLE_NOW",
    });

    const second = await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(second.status).toBe(200);
    const pending = second.body.data.filter(
      (c: { status: string }) => c.status === "PENDING"
    );
    expect(pending).toHaveLength(2);
    const ids = pending.map(
      (c: { professionalId: string }) => c.professionalId
    );
    expect(ids).toContain(String(proA._id));
    expect(ids).toContain(String(proC._id));

    // One row per (intervention, professional) — no duplicates, ever.
    const total = await MatchingCandidate.countDocuments({
      intervention: intervention._id,
    });
    expect(total).toBe(3);

    const superseded = second.body.data.find(
      (c: { professionalId: string; status: string }) =>
        c.professionalId === String(proB._id)
    );
    expect(superseded.status).toBe("SUPERSEDED");
  });
});

describe("GET /interventions/:id/match", () => {
  it("returns sorted candidates for the owner only", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });

    await seedProfessional({
      displayName: "Pro",
      kmNorth: 2,
      availability: "AVAILABLE_NOW",
    });
    const intervention = await seedIntervention(owner.id);

    await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const ok = await request(app)
      .get(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveLength(1);

    const forbidden = await request(app)
      .get(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(forbidden.status).toBe(404);
  });
});

describe("POST /interventions/:id/match/:candidateId/accept", () => {
  async function setupTwoPros() {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const proA = await seedPro({
      displayName: "Pro A",
      kmNorth: 2,
      availability: "AVAILABLE_NOW",
    });
    const proB = await seedPro({
      displayName: "Pro B",
      kmNorth: 4,
      availability: "AVAILABLE_NOW",
    });

    // Matching run by the customer produces one PENDING candidate per eligible pro.
    await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const candidates = await MatchingCandidate.find({
      intervention: intervention._id,
    }).sort({ score: -1 });

    return { owner, intervention, proA, proB, candidates };
  }

  it("accepts a pending candidate and locks the intervention (REQUESTED → ACCEPTED)", async () => {
    const { intervention, proA, candidates } = await setupTwoPros();
    const candidate = candidates.find(
      (c) => String(c.professional) === String(proA.pro._id)
    );
    expect(candidate).toBeDefined();

    const res = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${proA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACCEPTED");
    expect(res.body.data.professionalId).toBe(String(proA.pro._id));
    expect(res.body.data.candidateId).toBe(String(candidate!._id));

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("ACCEPTED");
    expect(iv?.professional?.toString()).toBe(String(proA.pro._id));
    expect(iv?.startedAt).toBeDefined();

    const cand = await MatchingCandidate.findById(candidate!._id).lean();
    expect(cand?.status).toBe("ACCEPTED");
    expect(cand?.acceptedAt).toBeDefined();

    const history = await InterventionStatusHistory.findOne({
      intervention: intervention._id,
      toStatus: "ACCEPTED",
    }).lean();
    expect(history?.fromStatus).toBe("REQUESTED");
    expect(history?.actor?.toString()).toBe(String(proA.userId));
  });

  it("returns 409 when a second provider races the same intervention", async () => {
    const { intervention, proA, proB, candidates } = await setupTwoPros();
    const candA = candidates.find(
      (c) => String(c.professional) === String(proA.pro._id)
    );
    const candB = candidates.find(
      (c) => String(c.professional) === String(proB.pro._id)
    );

    const first = await request(app)
      .post(`/interventions/${intervention._id}/match/${candA!._id}/accept`)
      .set("Authorization", `Bearer ${proA.accessToken}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/interventions/${intervention._id}/match/${candB!._id}/accept`)
      .set("Authorization", `Bearer ${proB.accessToken}`);
    expect(second.status).toBe(409);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("ACCEPTED");
    expect(iv?.professional?.toString()).toBe(String(proA.pro._id));

    // Losing candidate is rolled back to DECLINED, never left ACCEPTED.
    const cand = await MatchingCandidate.findById(candB!._id).lean();
    expect(cand?.status).toBe("DECLINED");
  });

  it("403s when a provider tries to accept another provider's candidate", async () => {
    const { intervention, proA, proB, candidates } = await setupTwoPros();
    const candB = candidates.find(
      (c) => String(c.professional) === String(proB.pro._id)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/match/${candB!._id}/accept`)
      .set("Authorization", `Bearer ${proA.accessToken}`);
    expect(res.status).toBe(403);

    const cand = await MatchingCandidate.findById(candB!._id).lean();
    expect(cand?.status).toBe("PENDING");
  });

  it("403s when a customer (role: user) attempts to accept", async () => {
    const { owner, intervention, proA, candidates } = await setupTwoPros();
    const candidate = candidates.find(
      (c) => String(c.professional) === String(proA.pro._id)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("is idempotent on replay: re-accepting an accepted candidate returns 409", async () => {
    const { intervention, proA, candidates } = await setupTwoPros();
    const candidate = candidates.find(
      (c) => String(c.professional) === String(proA.pro._id)
    );

    const first = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${proA.accessToken}`);
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${proA.accessToken}`);
    expect(replay.status).toBe(409);
  });
});
