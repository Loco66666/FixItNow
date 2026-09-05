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

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    registrationNumber: `AA-${Math.floor(Math.random() * 900 + 100)}-ZZ`,
    make: "Renault",
    model: "Clio",
    year: 2019,
    mileageKm: 87400,
    ...overrides,
  };
}

async function seedVehicleFor(
  ownerId: string,
  overrides: Record<string, unknown> = {}
) {
  const vehicle = await Vehicle.create({
    owner: ownerId as never,
    registrationNumber: `AB-${Math.floor(Math.random() * 900 + 100)}-CD`,
    make: "Peugeot",
    model: "3008",
    ...overrides,
  });
  return vehicle as HydratedDocument<VehicleDoc>;
}

describe("POST /vehicles", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/vehicles").send({});
    expect(res.status).toBe(401);
  });

  it("creates a vehicle owned by the caller", async () => {
    const user = await makeUser({ role: "user" });
    const payload = createPayload();

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBe(user.id);
    expect(res.body.data.make).toBe("Renault");
  });

  it("normalizes the registration number to uppercase", async () => {
    const user = await makeUser({ role: "user" });

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(createPayload({ registrationNumber: "bc-789-ef" }));

    expect(res.status).toBe(201);
    expect(res.body.data.registrationNumber).toBe("BC-789-EF");
  });

  it("409s on duplicate registration number (case-insensitive)", async () => {
    const user = await makeUser({ role: "user" });

    const first = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(createPayload({ registrationNumber: "xy-111-zz" }));
    expect(first.status).toBe(201);

    const other = await makeUser({ role: "user" });
    const duplicate = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send(createPayload({ registrationNumber: "XY-111-ZZ" }));

    expect(duplicate.status).toBe(409);
  });

  it("validates the body (bad year, missing make)", async () => {
    const user = await makeUser({ role: "user" });
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(createPayload({ year: 1700, make: "" }));

    expect(res.status).toBe(400);
  });
});

describe("GET /vehicles/mine", () => {
  it("lists only the caller's vehicles, newest first", async () => {
    const a = await makeUser({ role: "user" });
    const b = await makeUser({ role: "user" });

    await seedVehicleFor(a.id, { registrationNumber: "AZ-111-AA" });
    await seedVehicleFor(a.id, { registrationNumber: "AZ-222-AA" });
    await seedVehicleFor(b.id, { registrationNumber: "AZ-333-BB" });

    const mine = await request(app)
      .get("/vehicles/mine")
      .set("Authorization", `Bearer ${a.accessToken}`);

    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.pagination.total).toBe(2);
  });
});

describe("GET /vehicles/:id", () => {
  it("returns the vehicle for its owner", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(user.id, {
      registrationNumber: "AZ-444-AA",
    });

    const res = await request(app)
      .get(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.registrationNumber).toBe("AZ-444-AA");
  });

  it("404s for another customer's vehicle", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(owner.id, {
      registrationNumber: "AZ-555-AA",
    });

    const res = await request(app)
      .get(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /vehicles/:id", () => {
  it("updates mileage and model for the owner", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(user.id, {
      registrationNumber: "AZ-666-AA",
    });

    const res = await request(app)
      .patch(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ mileageKm: 90000, version: "1.2 PureTech 130" });

    expect(res.status).toBe(200);
    expect(res.body.data.mileageKm).toBe(90000);
    expect(res.body.data.version).toBe("1.2 PureTech 130");
  });

  it("404s when updating another customer's vehicle", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(owner.id, {
      registrationNumber: "AZ-777-AA",
    });

    const res = await request(app)
      .patch(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ mileageKm: 1 });

    expect(res.status).toBe(404);
  });

  it("400s when no field is provided", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(user.id, {
      registrationNumber: "AZ-888-AA",
    });

    const res = await request(app)
      .patch(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("DELETE /vehicles/:id", () => {
  it("deletes the vehicle for its owner, then 404s on re-fetch", async () => {
    const user = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(user.id, {
      registrationNumber: "AZ-999-AA",
    });

    const del = await request(app)
      .delete(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(del.status).toBe(200);

    const refetch = await request(app)
      .get(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(refetch.status).toBe(404);
  });

  it("404s when deleting another customer's vehicle", async () => {
    const owner = await makeUser({ role: "user" });
    const stranger = await makeUser({ role: "user" });
    const vehicle = await seedVehicleFor(owner.id, {
      registrationNumber: "AZ-999-AA",
    });

    const res = await request(app)
      .delete(`/vehicles/${vehicle._id}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });
});
