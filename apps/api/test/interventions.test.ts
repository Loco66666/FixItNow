import request from "supertest";
import type { HydratedDocument } from "mongoose";
import { useRedisMock } from "./helpers/redis-mock";
import {
  clearCollections,
  connectInMemoryMongo,
  disconnectInMemoryMongo,
} from "./helpers/db";
import { createApp } from "../src/app";
import { makeUser } from "./helpers/auth";
import { Vehicle } from "../src/models/automotive/Vehicle";
import type { VehicleDoc } from "../src/models/automotive/Vehicle";
import { InterventionStatusHistory } from "../src/models/automotive/InterventionStatusHistory";

const app = createApp();

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

async function seedOwnedVehicle(ownerId: string) {
  const vehicle = await Vehicle.create({
    owner: ownerId as never,
    registrationNumber: `AA-${Math.floor(Math.random() * 900 + 100)}-ZZ`,
    make: "Renault",
    model: "Clio",
    year: 2019,
  });
  return vehicle as HydratedDocument<VehicleDoc>;
}

function createPayload(vehicleId: string) {
  return {
    vehicleId,
    urgency: "URGENT",
    title: "La voiture ne démarre plus",
    description: "Batterie à plat, je suis dans un parking à Limoges.",
    address: "12 rue de la Boucherie",
    city: "Limoges",
    postalCode: "87000",
    latitude: 45.8336,
    longitude: 1.2611,
  };
}

describe("POST /interventions", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/interventions").send({});
    expect(res.status).toBe(401);
  });

  it("creates an intervention with defaults (EUR, HOME, REQUESTED)", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(user.id);

    const res = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(createPayload(String(vehicle._id)));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("REQUESTED");
    expect(res.body.data.currency).toBe("EUR");
    expect(res.body.data.locationContext).toBe("HOME");
    expect(res.body.data.customerId).toBe(user.id);
    expect(res.body.data.vehicleId).toBe(String(vehicle._id));

    const history = await InterventionStatusHistory.find({
      intervention: res.body.data.id,
    })
      .lean()
      .exec();
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe("REQUESTED");
  });

  it("accepts an explicit location context (HIGHWAY)", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(user.id);

    const res = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        ...createPayload(String(vehicle._id)),
        locationContext: "HIGHWAY",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.locationContext).toBe("HIGHWAY");
  });

  it("404s when the vehicle does not belong to the caller", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(owner.id);

    const res = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send(createPayload(String(vehicle._id)));

    expect(res.status).toBe(404);
  });

  it("validates the body (missing fields, bad coordinates)", async () => {
    const user = await makeUser({ role: "user" });
    const res = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ title: "", latitude: 200 });

    expect(res.status).toBe(400);
  });
});

describe("GET /interventions/mine", () => {
  it("lists only the caller's interventions", async () => {
    const a = await makeUser({ role: "user" });
    const b = await makeUser({ role: "user" });
    const vehicleA = await seedOwnedVehicle(a.id);
    const vehicleB = await seedOwnedVehicle(b.id);

    await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(createPayload(String(vehicleA._id)));
    await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(createPayload(String(vehicleA._id)));
    await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send(createPayload(String(vehicleB._id)));

    const mine = await request(app)
      .get("/interventions/mine")
      .set("Authorization", `Bearer ${a.accessToken}`);

    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.pagination.total).toBe(2);
  });
});

describe("GET /interventions/:id", () => {
  it("hides other customers' interventions (404)", async () => {
    const a = await makeUser({ role: "user" });
    const b = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(a.id);

    const created = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(createPayload(String(vehicle._id)));

    const res = await request(app)
      .get(`/interventions/${created.body.data.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /interventions/:id/history", () => {
  it("returns the chronological status history for the owner", async () => {
    const a = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(a.id);

    const created = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(createPayload(String(vehicle._id)));

    const history = await request(app)
      .get(`/interventions/${created.body.data.id}/history`)
      .set("Authorization", `Bearer ${a.accessToken}`);

    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].toStatus).toBe("REQUESTED");
    expect(history.body.data[0].interventionId).toBe(created.body.data.id);
  });

  it("hides the history of other customers' interventions (404)", async () => {
    const a = await makeUser({ role: "user" });
    const b = await makeUser({ role: "user" });
    const vehicle = await seedOwnedVehicle(a.id);

    const created = await request(app)
      .post("/interventions")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(createPayload(String(vehicle._id)));

    const res = await request(app)
      .get(`/interventions/${created.body.data.id}/history`)
      .set("Authorization", `Bearer ${b.accessToken}`);

    expect(res.status).toBe(404);
  });
});
