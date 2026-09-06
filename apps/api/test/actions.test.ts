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
import { MatchingCandidate } from "../src/models/automotive/MatchingCandidate";
import { ProviderRealtimeStatus } from "../src/models/automotive/ProviderRealtimeStatus";
import { InterventionStatusHistory } from "../src/models/automotive/InterventionStatusHistory";
import { subscribeInterventionEvent } from "../src/services/intervention-events";

const app = createApp();
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
  return {
    latitude: CENTER.latitude + kmNorth / 111.32,
    longitude: CENTER.longitude,
  };
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
      coordinates: [CENTER.longitude, CENTER.latitude],
    },
    services: ["Batterie"],
    currency: "EUR",
    ...overrides,
  });
}

/** Seed a professional whose JWT maps to domainRole PROFESSIONAL. */
async function seedPro(displayName: string) {
  const user = await makeUser({ role: "owner" });
  const point = offsetPoint(2);
  const pro = await Professional.create({
    user: user.id,
    type: "INDEPENDENT",
    displayName,
    serviceRadiusKm: 30,
    verificationStatus: "APPROVED",
    isActive: true,
    isHighwayAuthorized: false,
    location: { type: "Point", coordinates: [point.longitude, point.latitude] },
  });
  await Availability.create({
    professional: pro._id,
    status: "AVAILABLE_NOW",
    timezone: "Europe/Paris",
  });
  return { pro, accessToken: user.accessToken, userId: user.id };
}

/**
 * Run matching as the customer and accept the top candidate as the pro, so the
 * intervention ends up ACCEPTED with `professional` assigned — the starting
 * point of the lifecycle actions.
 */
async function acceptSeededIntervention(
  customerToken: string,
  proToken: string,
  proId: string,
  interventionId: string
) {
  await request(app)
    .post(`/interventions/${interventionId}/match`)
    .set("Authorization", `Bearer ${customerToken}`);
  // Accept this pro's own candidate (not the top-scored, which may be another
  // pro's — accepting someone else's candidate would 403).
  const candidate = await MatchingCandidate.findOne({
    intervention: new Types.ObjectId(interventionId),
    professional: new Types.ObjectId(proId),
  });
  expect(candidate).toBeTruthy();

  const accept = await request(app)
    .post(`/interventions/${interventionId}/match/${candidate!._id}/accept`)
    .set("Authorization", `Bearer ${proToken}`);
  expect(accept.status).toBe(200);
  return candidate!;
}

describe("POST /interventions/:id/actions/:action", () => {
  it("requires authentication", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app).post(
      `/interventions/${intervention._id}/actions/en-route`
    );
    expect(res.status).toBe(401);
  });

  it("403s when a customer (role: user) attempts a provider action", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/actions/en-route`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("400s on an unknown action", async () => {
    const owner = await makeUser({ role: "user" });
    const pro = await seedPro("Pro A");
    const intervention = await seedIntervention(owner.id);
    await acceptSeededIntervention(
      owner.accessToken,
      pro.accessToken,
      String(pro.pro._id),
      String(intervention._id)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/actions/fly`)
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(res.status).toBe(400);
  });

  it("403s when a professional other than the assigned one acts", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const proA = await seedPro("Pro A");
    const proB = await seedPro("Pro B");

    await acceptSeededIntervention(
      owner.accessToken,
      proA.accessToken,
      String(proA.pro._id),
      String(intervention._id)
    );

    // proB is a registered professional but NOT the assigned one.
    const res = await request(app)
      .post(`/interventions/${intervention._id}/actions/en-route`)
      .set("Authorization", `Bearer ${proB.accessToken}`);
    expect(res.status).toBe(403);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("ACCEPTED");
  });

  it("runs the full lifecycle ACCEPTED → EN_ROUTE → ARRIVED → DIAGNOSING → COMPLETED", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Full Lifecycle Pro");

    await acceptSeededIntervention(
      owner.accessToken,
      pro.accessToken,
      String(pro.pro._id),
      String(intervention._id)
    );

    const post = (action: string, body?: Record<string, unknown>) =>
      request(app)
        .post(`/interventions/${intervention._id}/actions/${action}`)
        .set("Authorization", `Bearer ${pro.accessToken}`)
        .send(body ?? {});

    const enRoute = await post("en-route");
    expect(enRoute.status).toBe(200);
    expect(enRoute.body.data.previousStatus).toBe("ACCEPTED");
    expect(enRoute.body.data.status).toBe("EN_ROUTE");

    const arrive = await post("arrive");
    expect(arrive.status).toBe(200);
    expect(arrive.body.data.status).toBe("ARRIVED");

    const diagnose = await post("diagnose", { note: "Batterie HS" });
    expect(diagnose.status).toBe(200);
    expect(diagnose.body.data.status).toBe("DIAGNOSING");

    const complete = await post("complete");
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe("COMPLETED");
    expect(complete.body.data.completedAt).toBeDefined();

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("COMPLETED");
    expect(iv?.completedAt).toBeDefined();

    // History: REQUESTED→ACCEPTED (accept) + the 4 lifecycle transitions.
    const history = await InterventionStatusHistory.find({
      intervention: intervention._id,
    })
      .sort({ createdAt: 1 })
      .lean();
    expect(history).toHaveLength(5);
    expect(history.map((h) => h.toStatus)).toEqual([
      "ACCEPTED",
      "EN_ROUTE",
      "ARRIVED",
      "DIAGNOSING",
      "COMPLETED",
    ]);

    // The provider is released back to OPEN after completion.
    const rt = await ProviderRealtimeStatus.findOne({
      professional: pro.pro._id,
    }).lean();
    expect(rt?.status).toBe("OPEN");
  });

  it("409s on an illegal transition (arrive directly from ACCEPTED)", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Skipper Pro");

    await acceptSeededIntervention(
      owner.accessToken,
      pro.accessToken,
      String(pro.pro._id),
      String(intervention._id)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/actions/arrive`)
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(res.status).toBe(409);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("ACCEPTED");
  });

  it("409s once the intervention is COMPLETED (terminal)", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Done Pro");

    await acceptSeededIntervention(
      owner.accessToken,
      pro.accessToken,
      String(pro.pro._id),
      String(intervention._id)
    );
    const post = (action: string) =>
      request(app)
        .post(`/interventions/${intervention._id}/actions/${action}`)
        .set("Authorization", `Bearer ${pro.accessToken}`);

    for (const action of ["en-route", "arrive", "diagnose", "complete"]) {
      expect((await post(action)).status).toBe(200);
    }

    const replay = await post("complete");
    expect(replay.status).toBe(409);
  });

  it("streams each transition on the intervention SSE channel", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Streaming Pro");

    await acceptSeededIntervention(
      owner.accessToken,
      pro.accessToken,
      String(pro.pro._id),
      String(intervention._id)
    );

    const received: Array<{ type: string; data: Record<string, unknown> }> = [];
    const unsubscribe = await subscribeInterventionEvent(
      String(intervention._id),
      (event) => received.push(event as never)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/actions/en-route`)
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const statusEvent = received.find(
      (e) => e.type === "intervention.status-changed"
    );
    expect(statusEvent).toBeTruthy();
    expect(statusEvent?.data.action).toBe("en-route");
    expect(statusEvent?.data.from).toBe("ACCEPTED");
    expect(statusEvent?.data.to).toBe("EN_ROUTE");
    expect(statusEvent?.data.professionalId).toBe(String(pro.pro._id));

    await unsubscribe();
  });
});
