/**
 * Integration tests for POST /interventions/:id/quote (PHASE 06).
 *
 * Fixtures mirror the 5.3 actions.test.ts helpers: a customer + an assigned
 * professional in ACCEPTED, then we drive the lifecycle en-route → arrive →
 * diagnose so the intervention reaches DIAGNOSING, where quoting is legal.
 */
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
import { Quote } from "../src/models/automotive/Quote";
import { QuoteItem } from "../src/models/automotive/QuoteItem";
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
    title: "Batterie a plat",
    description: "La voiture ne demarre plus.",
    location: {
      address: "Place de la Republique",
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

/** Drive the assigned pro through en-route -> arrive -> diagnose to reach DIAGNOSING. */
async function driveToDiagnosing(interventionId: string, proToken: string) {
  const post = (action: string) =>
    request(app)
      .post(`/interventions/${interventionId}/actions/${action}`)
      .set("Authorization", `Bearer ${proToken}`)
      .send({});
  for (const action of ["en-route", "arrive", "diagnose"]) {
    const r = await post(action);
    expect(r.status).toBe(200);
  }
}

const SAMPLE_ITEMS = [
  {
    description: "Remplacement batterie 12V",
    quantity: 1,
    unit_price: 12000,
    tax_rate: 0.2,
    kind: "part",
  },
  {
    description: "Mains d'oeuvre diagnostic",
    quantity: 1,
    unit_price: 6000,
    tax_rate: 0.2,
    kind: "labor",
  },
];

/** Match + accept as `pro`, returning nothing (asserts 200). */
async function matchAndAccept(
  interventionId: string,
  ownerToken: string,
  pro: { pro: { _id: Types.ObjectId }; accessToken: string }
) {
  await request(app)
    .post(`/interventions/${interventionId}/match`)
    .set("Authorization", `Bearer ${ownerToken}`);
  const candidate = await MatchingCandidate.findOne({
    intervention: new Types.ObjectId(interventionId),
    professional: new Types.ObjectId(pro.pro._id),
  });
  expect(candidate).toBeTruthy();
  await request(app)
    .post(`/interventions/${interventionId}/match/${candidate!._id}/accept`)
    .set("Authorization", `Bearer ${pro.accessToken}`);
}

describe("POST /interventions/:id/quote", () => {
  it("requires authentication", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .send({ items: SAMPLE_ITEMS });
    expect(res.status).toBe(401);
  });

  it("403s when a customer (role: user) attempts a provider quote", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ items: SAMPLE_ITEMS });
    expect(res.status).toBe(403);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("REQUESTED");
  });

  it("403s when a professional who is NOT the assigned one quotes", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const proA = await seedPro("Assigned Pro");
    const proB = await seedPro("Stranger Pro");

    await matchAndAccept(String(intervention._id), owner.accessToken, proA);
    await driveToDiagnosing(String(intervention._id), proA.accessToken);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${proB.accessToken}`)
      .send({ items: SAMPLE_ITEMS });
    expect(res.status).toBe(403);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("DIAGNOSING");
  });

  it("409s when the intervention is not in DIAGNOSING", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Diagnosing Pro");

    await matchAndAccept(String(intervention._id), owner.accessToken, pro);
    // State is now ACCEPTED (not DIAGNOSING) → quoting must be rejected.
    const res = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({ items: SAMPLE_ITEMS });
    expect(res.status).toBe(409);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("ACCEPTED");
  });

  it("creates a devis, advances DIAGNOSING -> QUOTE_PENDING, writes history + SSE", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Diagnosing Pro");

    await matchAndAccept(String(intervention._id), owner.accessToken, pro);
    await driveToDiagnosing(String(intervention._id), pro.accessToken);

    // Listen on the SSE channel BEFORE quoting so we capture the events.
    const received: Array<{ type: string; data: Record<string, unknown> }> = [];
    const cleanup = await subscribeInterventionEvent(
      String(intervention._id),
      (e) => received.push(e)
    );

    const res = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({ items: SAMPLE_ITEMS, notes: "Devis batterie" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("SENT");
    expect(res.body.data.currency).toBe("EUR");

    // Totals: HT = 12000 + 6000 = 18000, TVA 20% = 3600, TTC = 21600.
    expect(res.body.data.subtotalCents).toBe(18000);
    expect(res.body.data.taxAmountCents).toBe(3600);
    expect(res.body.data.totalAmountCents).toBe(21600);
    expect(
      (res.body.data.items as Array<{ totalCents: number }>).map(
        (i) => i.totalCents
      )
    ).toEqual([12000, 6000]);

    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("QUOTE_PENDING");

    await cleanup();

    // History row for the DIAGNOSING -> QUOTE_PENDING transition.
    const history = await InterventionStatusHistory.find({
      intervention: new Types.ObjectId(intervention._id),
    }).lean();
    const devisRow = history.find((h) => h.toStatus === "QUOTE_PENDING");
    expect(devisRow).toBeTruthy();
    expect(devisRow?.reason).toBe("Devis batterie");

    // Quote + items persisted with the aggregated totals.
    const quote = await Quote.findOne({
      intervention: new Types.ObjectId(intervention._id),
    }).lean();
    expect(quote).toBeTruthy();
    expect(quote?.status).toBe("SENT");
    expect(quote?.subtotalCents).toBe(18000);
    expect(quote?.taxAmountCents).toBe(3600);
    expect(quote?.totalAmountCents).toBe(21600);

    const items = await QuoteItem.find({ quote: quote!._id })
      .sort({ totalCents: -1 })
      .lean();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.totalCents)).toEqual([12000, 6000]);
    expect(items.every((i) => i.taxRate === 0.2)).toBe(true);

    // Both the domain event and the status transition were streamed.
    expect(received.some((e) => e.type === "intervention.quote.created")).toBe(
      true
    );
    expect(received.some((e) => e.type === "intervention.status-changed")).toBe(
      true
    );
  });

  it("validates the quote payload (empty items / bad quantity)", async () => {
    const owner = await makeUser({ role: "user" });
    const pro = await seedPro("Diagnosing Pro");
    const intervention = await seedIntervention(owner.id);

    await matchAndAccept(String(intervention._id), owner.accessToken, pro);
    await driveToDiagnosing(String(intervention._id), pro.accessToken);

    const empty = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({ items: [] });
    expect(empty.status).toBe(400);

    const badQty = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({
        items: [
          {
            description: "Descriptif valide ici",
            quantity: 0,
            unit_price: 1000,
            tax_rate: 0.2,
          },
        ],
      });
    expect(badQty.status).toBe(400);

    // The intervention must still be in DIAGNOSING after rejected payloads.
    const iv = await Intervention.findById(intervention._id).lean();
    expect(iv?.status).toBe("DIAGNOSING");
  });
});

describe("POST /interventions/:id/quote/:quoteId/:decision", () => {
  /** Full setup: match → accept → diagnose → quote. Returns tokens + ids. */
  async function setupPendingQuote() {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);
    const pro = await seedPro("Diagnosing Pro");

    await matchAndAccept(String(intervention._id), owner.accessToken, pro);
    await driveToDiagnosing(String(intervention._id), pro.accessToken);

    const created = await request(app)
      .post(`/interventions/${intervention._id}/quote`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({ items: SAMPLE_ITEMS, notes: "Devis batterie" });
    expect(created.status).toBe(201);
    const quoteId = created.body.data.quoteId as string;

    return {
      owner,
      pro,
      interventionId: String(intervention._id),
      quoteId,
    };
  }

  const decide = (interventionId: string, quoteId: string, decision: string) =>
    request(app).post(
      `/interventions/${interventionId}/quote/${quoteId}/${decision}`
    );

  it("requires authentication", async () => {
    const { interventionId, quoteId } = await setupPendingQuote();
    const res = await decide(interventionId, quoteId, "accept");
    expect(res.status).toBe(401);
  });

  it("403s when another customer (not the owner) decides", async () => {
    const { interventionId, quoteId } = await setupPendingQuote();
    const stranger = await makeUser({ role: "user" });

    const res = await decide(interventionId, quoteId, "accept").set(
      "Authorization",
      `Bearer ${stranger.accessToken}`
    );
    expect(res.status).toBe(403);

    const iv = await Intervention.findById(interventionId).lean();
    expect(iv?.status).toBe("QUOTE_PENDING");
  });

  it("403s when the assigned professional tries to decide", async () => {
    const { interventionId, quoteId, pro } = await setupPendingQuote();

    const res = await decide(interventionId, quoteId, "accept").set(
      "Authorization",
      `Bearer ${pro.accessToken}`
    );
    expect(res.status).toBe(403);
  });

  it("accepts: QUOTE_PENDING -> QUOTE_ACCEPTED + quote ACCEPTED + SSE", async () => {
    const { owner, interventionId, quoteId } = await setupPendingQuote();

    const received: Array<{ type: string }> = [];
    const cleanup = await subscribeInterventionEvent(interventionId, (e) =>
      received.push(e)
    );

    const res = await decide(interventionId, quoteId, "accept").set(
      "Authorization",
      `Bearer ${owner.accessToken}`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("QUOTE_ACCEPTED");
    expect(res.body.data.quoteStatus).toBe("ACCEPTED");

    const iv = await Intervention.findById(interventionId).lean();
    expect(iv?.status).toBe("QUOTE_ACCEPTED");

    await cleanup();

    const quote = await Quote.findById(quoteId).lean();
    expect(quote?.status).toBe("ACCEPTED");

    expect(received.some((e) => e.type === "intervention.quote.accepted")).toBe(
      true
    );
    expect(received.some((e) => e.type === "intervention.status-changed")).toBe(
      true
    );

    // History row for the customer decision.
    const history = await InterventionStatusHistory.find({
      intervention: new Types.ObjectId(interventionId),
    }).lean();
    expect(
      history.some(
        (h) =>
          h.toStatus === "QUOTE_ACCEPTED" &&
          h.reason === "Customer accepted the devis"
      )
    ).toBe(true);
  });

  it("rejects: QUOTE_PENDING -> DIAGNOSING (revised devis) + quote REJECTED", async () => {
    const { owner, interventionId, quoteId } = await setupPendingQuote();

    const res = await decide(interventionId, quoteId, "reject").set(
      "Authorization",
      `Bearer ${owner.accessToken}`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DIAGNOSING");
    expect(res.body.data.quoteStatus).toBe("REJECTED");

    const iv = await Intervention.findById(interventionId).lean();
    expect(iv?.status).toBe("DIAGNOSING");

    const quote = await Quote.findById(quoteId).lean();
    expect(quote?.status).toBe("REJECTED");
  });

  it("409s on a double decision (already QUOTE_ACCEPTED)", async () => {
    const { owner, interventionId, quoteId } = await setupPendingQuote();

    const first = await decide(interventionId, quoteId, "accept").set(
      "Authorization",
      `Bearer ${owner.accessToken}`
    );
    expect(first.status).toBe(200);

    const second = await decide(interventionId, quoteId, "accept").set(
      "Authorization",
      `Bearer ${owner.accessToken}`
    );
    expect(second.status).toBe(409);
  });

  it("400s on an unknown decision verb", async () => {
    const { owner, interventionId, quoteId } = await setupPendingQuote();

    const res = await decide(interventionId, quoteId, "maybe").set(
      "Authorization",
      `Bearer ${owner.accessToken}`
    );
    expect(res.status).toBe(400);
  });
});
