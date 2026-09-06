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
import { Conversation } from "../src/models/automotive/Conversation";
import { Message } from "../src/models/automotive/Message";
import { Notification } from "../src/models/automotive/Notification";

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

async function seedIntervention(customerId: string) {
  return Intervention.create({
    customer: customerId,
    vehicle: new Types.ObjectId(),
    status: "ACCEPTED",
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

async function seedPro(displayName: string) {
  const user = await makeUser({ role: "owner" });
  const pro = await Professional.create({
    user: user.id,
    type: "INDEPENDENT",
    displayName,
    serviceRadiusKm: 30,
    verificationStatus: "APPROVED",
    isActive: true,
    isHighwayAuthorized: false,
    location: {
      type: "Point",
      coordinates: [CENTER.longitude, CENTER.latitude + 2 / 111.32],
    },
  });
  await Availability.create({
    professional: pro._id,
    status: "AVAILABLE_NOW",
    timezone: "Europe/Paris",
  });
  return { pro, accessToken: user.accessToken, userId: user.id };
}

/** Intervention assigned to the pro (accepted) + tokens. */
async function setupAssignedIntervention() {
  const owner = await makeUser({ role: "user" });
  const pro = await seedPro("Chat Pro");
  const intervention = await seedIntervention(owner.id);
  await Intervention.updateOne(
    { _id: intervention._id },
    { $set: { professional: pro.pro._id } }
  );
  return { owner, pro, interventionId: String(intervention._id) };
}

/** Get-or-create the thread as the owner, returning its id. */
async function getThread(interventionId: string, token: string) {
  const conv = await request(app)
    .get(`/interventions/${interventionId}/conversation`)
    .set("Authorization", `Bearer ${token}`);
  expect(conv.status).toBe(200);
  return conv.body.data.conversationId as string;
}

describe("GET /interventions/:id/conversation", () => {
  it("requires authentication", async () => {
    const { interventionId } = await setupAssignedIntervention();
    const res = await request(app).get(
      `/interventions/${interventionId}/conversation`
    );
    expect(res.status).toBe(401);
  });

  it("403s a stranger (neither owner nor assigned pro)", async () => {
    const { interventionId } = await setupAssignedIntervention();
    const stranger = await makeUser({ role: "user" });

    const res = await request(app)
      .get(`/interventions/${interventionId}/conversation`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("returns (and reuses) the conversation thread for the owner", async () => {
    const { owner, interventionId } = await setupAssignedIntervention();

    const first = await request(app)
      .get(`/interventions/${interventionId}/conversation`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.conversationId).toBeDefined();
    expect(first.body.data.interventionId).toBe(interventionId);

    const second = await request(app)
      .get(`/interventions/${interventionId}/conversation`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(second.body.data.conversationId).toBe(
      first.body.data.conversationId
    );
    expect(await Conversation.countDocuments()).toBe(1);
  });
});

describe("POST + GET /conversations/:id/messages", () => {
  it("requires authentication", async () => {
    const { owner, interventionId } = await setupAssignedIntervention();
    const conversationId = await getThread(interventionId, owner.accessToken);
    const res = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .send({ content: "Bonjour" });
    expect(res.status).toBe(401);
  });

  it("403s a non-participant on send and read", async () => {
    const { owner, interventionId } = await setupAssignedIntervention();
    const stranger = await makeUser({ role: "user" });
    const conversationId = await getThread(interventionId, owner.accessToken);

    const send = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ content: "Sneaky message" });
    expect(send.status).toBe(403);

    const read = await request(app)
      .get(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(read.status).toBe(403);
  });

  it("sends a message (owner), updates lastMessageAt, notifies the pro, lists history", async () => {
    const { owner, pro, interventionId } = await setupAssignedIntervention();
    const conversationId = await getThread(interventionId, owner.accessToken);

    const send1 = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ content: "Bonjour, ou en etes-vous ?" });
    expect(send1.status).toBe(201);
    expect(send1.body.data.senderId).toBe(owner.id);

    const send2 = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${pro.accessToken}`)
      .send({ content: "En route, j arrive dans 10 minutes." });
    expect(send2.status).toBe(201);

    const convDoc = await Conversation.findById(conversationId).lean();
    expect(convDoc?.lastMessageAt).toBeTruthy();

    const proNotifications = await Notification.find({
      user: new Types.ObjectId(pro.userId),
      type: "MESSAGE",
    }).lean();
    expect(proNotifications).toHaveLength(1);
    expect(proNotifications[0].message).toContain("Bonjour");

    const ownerNotifications = await Notification.find({
      user: new Types.ObjectId(owner.id),
      type: "MESSAGE",
    }).lean();
    expect(ownerNotifications).toHaveLength(1);

    const history = await request(app)
      .get(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0].content).toContain("Bonjour");
    expect(history.body.data[1].content).toContain("En route");
    expect(
      await Message.countDocuments({
        conversation: new Types.ObjectId(conversationId),
      })
    ).toBe(2);
  });

  it("400s on an empty message body", async () => {
    const { owner, interventionId } = await setupAssignedIntervention();
    const conversationId = await getThread(interventionId, owner.accessToken);

    const res = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ content: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /conversations (list mine)", () => {
  it("lists the caller's conversations (customer and pro each see theirs)", async () => {
    const { owner, pro, interventionId } = await setupAssignedIntervention();
    await getThread(interventionId, owner.accessToken);

    const asOwner = await request(app)
      .get("/conversations")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toHaveLength(1);
    expect(asOwner.body.data[0].interventionId).toBe(interventionId);

    const asPro = await request(app)
      .get("/conversations")
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(asPro.status).toBe(200);
    expect(asPro.body.data).toHaveLength(1);
  });
});

describe("GET /conversations/notifications + read", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/conversations/notifications");
    expect(res.status).toBe(401);
  });

  it("lists notifications and marks one read (owner-only)", async () => {
    const { owner, pro, interventionId } = await setupAssignedIntervention();
    const conversationId = await getThread(interventionId, owner.accessToken);
    await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ content: "Ping" });

    const list = await request(app)
      .get("/conversations/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    const notificationId = list.body.data[0].notificationId as string;

    const read = await request(app)
      .post(`/conversations/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();

    const unread = await request(app)
      .get("/conversations/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${pro.accessToken}`);
    expect(unread.body.data).toHaveLength(0);

    const stranger = await makeUser({ role: "user" });
    const forbidden = await request(app)
      .post(`/conversations/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(forbidden.status).toBe(403);
  });
});
