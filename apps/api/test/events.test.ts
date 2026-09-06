import http from "http";
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
import { publishInterventionEvent } from "../src/services/intervention-events";

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
  // 1° latitude ≈ 111.32 km — deterministic fixture offsets.
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

/** Seed a professional whose JWT maps to role PROFESSIONAL (seedPro pattern). */
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

/** Open a raw SSE connection and collect chunks as they arrive. */
function openSse(server: http.Server, path: string, token: string) {
  const addr = server.address() as { port: number };
  const collected: Buffer[] = [];
  const req = http.get(
    {
      host: "127.0.0.1",
      port: addr.port,
      path,
      headers: { Authorization: `Bearer ${token}` },
    },
    (res) => {
      res.on("data", (chunk: Buffer) => collected.push(chunk));
    }
  );
  req.on("error", () => undefined);
  const text = () => Buffer.concat(collected).toString("utf8");
  return { req, text, close: () => req.destroy() };
}

/** Poll `getText()` until `needle` appears (or reject on timeout). */
function waitForText(getText: () => string, needle: string, timeoutMs = 3000) {
  return new Promise<string>((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const text = getText();
      if (text.includes(needle)) return resolve(text);
      if (Date.now() - started > timeoutMs) {
        return reject(
          new Error(`Timed out waiting for "${needle}"; got: ${text}`)
        );
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

describe("GET /events/intervention/:id", () => {
  it("requires authentication", async () => {
    const res = await request(app).get(
      "/events/intervention/000000000000000000000000"
    );
    expect(res.status).toBe(401);
  });

  it("404s for a user who is neither customer nor assigned professional", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .get(`/events/intervention/${intervention._id}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("400s on an invalid intervention id", async () => {
    const owner = await makeUser({ role: "user" });
    const res = await request(app)
      .get("/events/intervention/not-an-object-id")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(400);
  });
  it("streams intervention.accepted to the subscribed customer", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const { pro, accessToken } = await seedPro("Near Pro");

    await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const candidate = await MatchingCandidate.findOne({
      intervention: intervention._id,
    }).sort({ score: -1 });
    expect(candidate).toBeTruthy();

    const server = app.listen(0);
    const sse = openSse(
      server,
      `/events/intervention/${intervention._id}`,
      owner.accessToken
    );
    await waitForText(sse.text, ": connected");

    const accept = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(accept.status).toBe(200);

    const body = await waitForText(sse.text, "event: intervention.accepted");
    const dataLine = body
      .split("\n")
      .find((line) => line.startsWith("data: "))!;
    const payload = JSON.parse(dataLine.slice("data: ".length));

    expect(payload.type).toBe("intervention.accepted");
    expect(payload.interventionId).toBe(String(intervention._id));
    expect(payload.data.status).toBe("ACCEPTED");
    expect(payload.data.professionalId).toBe(String(pro._id));
    expect(payload.data.candidateId).toBe(String(candidate!._id));

    sse.close();
    server.close();
  });

  it("allows the assigned professional to connect as well", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const { accessToken } = await seedPro("Pro A");

    await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const candidate = await MatchingCandidate.findOne({
      intervention: intervention._id,
    });
    expect(candidate).toBeTruthy();

    await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${accessToken}`);

    const server = app.listen(0);
    const sse = openSse(
      server,
      `/events/intervention/${intervention._id}`,
      accessToken
    );
    await waitForText(sse.text, ": connected");
    sse.close();
    server.close();
  });

  it("marks the accepting professional as ON_INTERVENTION", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const { pro, accessToken } = await seedPro("Busy Pro");

    await request(app)
      .post(`/interventions/${intervention._id}/match`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const candidate = await MatchingCandidate.findOne({
      intervention: intervention._id,
    });
    expect(candidate).toBeTruthy();

    const accept = await request(app)
      .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(accept.status).toBe(200);

    const status = await ProviderRealtimeStatus.findOne({
      professional: pro._id,
    }).lean();
    expect(status?.status).toBe("ON_INTERVENTION");
  });

  it("stops forwarding after the client disconnects", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const server = app.listen(0);
    const sse = openSse(
      server,
      `/events/intervention/${intervention._id}`,
      owner.accessToken
    );
    await waitForText(sse.text, ": connected");

    sse.close();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const before = sse.text().length;

    await publishInterventionEvent({
      type: "intervention.status-changed",
      interventionId: String(intervention._id),
      data: { status: "SEARCHING" },
      emittedAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(sse.text().length).toBe(before);
    server.close();
  });
});
