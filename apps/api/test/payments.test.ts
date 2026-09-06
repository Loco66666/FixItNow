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
import { Payment } from "../src/models/automotive/Payment";
import { WebhookEvent } from "../src/models/automotive/WebhookEvent";
import {
  setStripeGatewayForTests,
  type StripeGateway,
} from "../src/services/stripe.client";

const app = createApp();
const CENTER = { latitude: 45.8336, longitude: 1.2611 };

function makeFakeGateway() {
  const log: Array<Record<string, unknown>> = [];
  const gateway: StripeGateway = {
    createManualCaptureIntent: async (input) => {
      log.push({ op: "create", ...input });
      return {
        id: "pi_fake_1",
        status: "requires_capture",
        clientSecret: "cs_fake",
      };
    },
    captureIntent: async (id) => {
      log.push({ op: "capture", id });
      return { id, status: "succeeded", amountCapturedCents: 21600 };
    },
    cancelIntent: async (id) => {
      log.push({ op: "cancel", id });
      return { id, status: "canceled" };
    },
    constructWebhookEvent: () => {
      throw new Error("not used in tests");
    },
  };
  return { gateway, log };
}

async function seedPro(displayName: string) {
  const user = await makeUser({ role: "owner" });
  const point = {
    latitude: CENTER.latitude + 2 / 111.32,
    longitude: CENTER.longitude,
  };
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
  return { pro, accessToken: user.accessToken };
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

async function seedIntervention(customerId: string) {
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
  });
}

/** Drive a fresh intervention all the way to an ACCEPTED devis. */
async function setupAcceptedQuote() {
  const owner = await makeUser({ role: "user" });
  const intervention = await seedIntervention(owner.id);
  const pro = await seedPro("Diagnosing Pro");

  await request(app)
    .post(`/interventions/${intervention._id}/match`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  const candidate = await MatchingCandidate.findOne({
    intervention: new Types.ObjectId(intervention._id),
    professional: new Types.ObjectId(pro.pro._id),
  });
  expect(candidate).toBeTruthy();
  await request(app)
    .post(`/interventions/${intervention._id}/match/${candidate!._id}/accept`)
    .set("Authorization", `Bearer ${pro.accessToken}`);

  for (const action of ["en-route", "arrive", "diagnose"]) {
    const r = await request(app)
      .post(`/interventions/${intervention._id}/actions/${action}`)
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(r.status).toBe(200);
  }

  const created = await request(app)
    .post(`/interventions/${intervention._id}/quote`)
    .set("Authorization", `Bearer ${pro.accessToken}`)
    .send({ items: SAMPLE_ITEMS, notes: "Devis batterie" });
  expect(created.status).toBe(201);
  const quoteId = created.body.data.quoteId as string;

  const accepted = await request(app)
    .post(`/interventions/${intervention._id}/quote/${quoteId}/accept`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  expect(accepted.status).toBe(200);

  return {
    owner,
    pro,
    interventionId: String(intervention._id),
    quoteId,
  };
}
describe("POST /interventions/:id/payments/authorize", () => {
  const { gateway, log } = makeFakeGateway();

  beforeAll(async () => {
    useRedisMock();
    await connectInMemoryMongo();
    setStripeGatewayForTests(gateway);
  });
  beforeEach(async () => {
    await clearCollections();
    log.length = 0;
  });
  afterAll(async () => {
    setStripeGatewayForTests(null);
    await disconnectInMemoryMongo();
  });

  it("requires authentication", async () => {
    const { owner, interventionId } = await setupAcceptedQuote();
    const res = await request(app).post(
      `/interventions/${interventionId}/payments/authorize`
    );
    expect(res.status).toBe(401);
  });

  it("403s a customer who is not the owner", async () => {
    const { interventionId } = await setupAcceptedQuote();
    const stranger = await makeUser({ role: "user" });

    const res = await request(app)
      .post(`/interventions/${interventionId}/payments/authorize`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("409s when there is no accepted devis (intervention not QUOTE_ACCEPTED)", async () => {
    const owner = await makeUser({ role: "user" });
    const intervention = await seedIntervention(owner.id);

    const res = await request(app)
      .post(`/interventions/${intervention._id}/payments/authorize`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
  });

  it("authorizes the accepted devis amount (201) with commission split", async () => {
    const { owner, interventionId } = await setupAcceptedQuote();

    const res = await request(app)
      .post(`/interventions/${interventionId}/payments/authorize`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.amountCents).toBe(21600);
    expect(res.body.data.platformFeeCents).toBe(Math.round((21600 * 15) / 100));
    expect(res.body.data.professionalAmountCents).toBe(
      21600 - Math.round((21600 * 15) / 100)
    );

    expect(log.some((e) => e.op === "create" && e.amountCents === 21600)).toBe(
      true
    );
  });

  it("409s when an authorization is already in flight", async () => {
    const { owner, interventionId } = await setupAcceptedQuote();

    const first = await request(app)
      .post(`/interventions/${interventionId}/payments/authorize`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/interventions/${interventionId}/payments/authorize`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(second.status).toBe(409);
  });
});
describe("POST /webhooks/stripe + capture on completion", () => {
  const { gateway, log } = makeFakeGateway();

  beforeAll(async () => {
    useRedisMock();
    await connectInMemoryMongo();
    setStripeGatewayForTests(gateway);
  });
  beforeEach(async () => {
    await clearCollections();
    log.length = 0;
  });
  afterAll(async () => {
    setStripeGatewayForTests(null);
    await disconnectInMemoryMongo();
  });

  async function createAuthorized() {
    const ctx = await setupAcceptedQuote();
    const auth = await request(app)
      .post(`/interventions/${ctx.interventionId}/payments/authorize`)
      .set("Authorization", `Bearer ${ctx.owner.accessToken}`);
    expect(auth.status).toBe(201);
    return { ...ctx, paymentId: auth.body.data.paymentId as string };
  }

  it("webhook: processes payment_intent.captured -> PAID (idempotent replay)", async () => {
    const { paymentId } = await createAuthorized();

    const payload = {
      id: "evt_captured_1",
      type: "payment_intent.captured",
      data: { object: { id: "pi_fake_1" } },
    };
    const first = await request(app).post("/webhooks/stripe").send(payload);
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe("applied");

    const paid = await Payment.findById(paymentId).lean();
    expect(paid?.status).toBe("PAID");

    const replay = await request(app).post("/webhooks/stripe").send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.outcome).toBe("duplicate");
  });

  it("webhook: payment_intent.canceled -> CANCELED", async () => {
    const { paymentId } = await createAuthorized();

    const payload = {
      id: "evt_canceled_1",
      type: "payment_intent.canceled",
      data: { object: { id: "pi_fake_1" } },
    };
    const res = await request(app).post("/webhooks/stripe").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied");

    const pay = await Payment.findById(paymentId).lean();
    expect(pay?.status).toBe("CANCELED");
  });

  it("webhook: rejects malformed payload with 400", async () => {
    const res = await request(app)
      .post("/webhooks/stripe")
      .send({ foo: "bar" });
    expect(res.status).toBe(400);
  });

  it("webhook: irrelevant event type is ignored (200, outcome=ignored)", async () => {
    const payload = {
      id: "evt_ignored_1",
      type: "invoice.created",
      data: { object: { id: "in_1" } },
    };
    const res = await request(app).post("/webhooks/stripe").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored");
  });

  it("captures the authorized payment on completion (service)", async () => {
    const { capturePaymentByIntervention } =
      await import("../src/services/payment.service");
    const ctx = await createAuthorized();

    await capturePaymentByIntervention(ctx.interventionId);

    const pay = await Payment.findById(ctx.paymentId).lean();
    expect(pay?.status).toBe("PAID");
    expect(log.some((e) => e.op === "capture")).toBe(true);
  });
});
