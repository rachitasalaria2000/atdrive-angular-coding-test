import { beforeEach, expect, test, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../../server/app";
import { memoryRepositories } from "./helpers";
const secret = "test-secret-with-at-least-thirty-two-characters";
let repos: ReturnType<typeof memoryRepositories>,
  app: ReturnType<typeof createApp>;
beforeEach(() => {
  repos = memoryRepositories();
  app = createApp(repos, {
    secret,
    authLimit: 100,
    weather: async () => {
      throw new Error("unavailable");
    },
  });
});
const register = (
  agent: ReturnType<typeof request.agent>,
  username = "tester",
) =>
  agent.post("/api/auth/register").send({ username, password: "Password123!" });
test("protected endpoints reject anonymous requests", async () => {
  expect((await request(app).get("/api/products")).status).toBe(401);
  expect(
    (await request(app).post("/api/orders").send({ productIds: [] })).status,
  ).toBe(401);
});
test("registration hashes passwords and does not return hash or password", async () => {
  const agent = request.agent(app);
  const res = await register(agent);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({ id: 1, username: "tester" });
  const stored = await repos.users.findByName("tester");
  expect(stored!.password).not.toBe("Password123!");
  expect(await bcrypt.compare("Password123!", stored!.password)).toBe(true);
  expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
  expect(res.headers["set-cookie"][0]).toContain("SameSite=Strict");
});
test("duplicate registration is 409 and weak credentials are rejected", async () => {
  const agent = request.agent(app);
  await register(agent);
  expect((await register(agent)).status).toBe(409);
  expect(
    (
      await agent
        .post("/api/auth/register")
        .send({ username: "x", password: "123" })
    ).status,
  ).toBe(400);
});
test("login validates hash, me restores session and logout clears it", async () => {
  const agent = request.agent(app);
  await register(agent);
  await agent.post("/api/auth/logout");
  expect((await agent.get("/api/auth/me")).status).toBe(401);
  expect(
    (
      await agent
        .post("/api/auth/login")
        .send({ username: "tester", password: "incorrect" })
    ).status,
  ).toBe(401);
  expect(
    (
      await agent
        .post("/api/auth/login")
        .send({ username: "TESTER", password: "Password123!" })
    ).status,
  ).toBe(200);
  expect((await agent.get("/api/auth/me")).body.username).toBe("tester");
});
test("product CRUD persists, rejects bad IDs and returns 404 for missing records", async () => {
  const agent = request.agent(app);
  await register(agent);
  const created = await agent.post("/api/products").send({
    name: "Keyboard",
    price: 1999.99,
    description: "Tactile switches",
  });
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect((await agent.get("/api/products/" + id)).body.name).toBe("Keyboard");
  expect(
    (
      await agent
        .put("/api/products/" + id)
        .send({ name: "Updated", price: 2000, description: "" })
    ).body.name,
  ).toBe("Updated");
  expect((await agent.get("/api/products")).body).toHaveLength(1);
  expect((await agent.get("/api/products/bad-id")).status).toBe(400);
  expect((await agent.delete("/api/products/" + id)).status).toBe(204);
  expect((await agent.get("/api/products/" + id)).status).toBe(404);
});
test("orders compute totals, enforce ownership, update and delete", async () => {
  const alice = request.agent(app),
    bob = request.agent(app);
  await register(alice, "alice");
  await register(bob, "bobby");
  const p = await alice
    .post("/api/products")
    .send({ name: "Lamp", price: 10.25, description: "" });
  const res = await alice.post("/api/orders").send({ productIds: [p.body.id] });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ userId: 1, totalAmount: 10.25 });
  const id = res.body.orderId;
  expect((await alice.get("/api/orders/" + id)).status).toBe(200);
  for (const method of ["get", "put", "delete"] as const) {
    const r = await bob[method]("/api/orders/" + id).send({
      productIds: [p.body.id],
    });
    expect(r.status).toBe(404);
  }
  expect((await bob.get("/api/orders")).body).toEqual([]);
  expect((await alice.delete("/api/products/" + p.body.id)).status).toBe(409);
  expect(
    (await alice.put("/api/orders/" + id).send({ productIds: [p.body.id] }))
      .status,
  ).toBe(200);
  expect((await alice.delete("/api/orders/" + id)).status).toBe(204);
  expect((await alice.get("/api/orders/" + id)).status).toBe(404);
});
test("rejects client-controlled userId and totalAmount, absent products and malformed order IDs", async () => {
  const agent = request.agent(app);
  await register(agent);
  expect(
    (
      await agent.post("/api/orders").send({
        productIds: ["000000000000000000000001"],
        totalAmount: 0,
        userId: 999,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await agent
        .post("/api/orders")
        .send({ productIds: ["000000000000000000000001"] })
    ).status,
  ).toBe(400);
  expect((await agent.get("/api/orders/not-a-number")).status).toBe(400);
});
test("weather/service errors are sanitized and unknown API paths return JSON 404", async () => {
  const agent = request.agent(app);
  await register(agent);
  const res = await agent.get("/api/weather");
  expect(res.status).toBe(503);
  expect(res.body.error).not.toContain("unavailable\n");
  expect((await agent.get("/api/no-such-endpoint")).status).toBe(404);
});
test("blocks cross-origin mutations and rate limits authentication", async () => {
  expect(
    (
      await request(app)
        .post("/api/auth/register")
        .set("Origin", "https://untrusted.example")
        .send({ username: "tester", password: "Password123!" })
    ).status,
  ).toBe(403);
  const limited = createApp(repos, {
    secret,
    authLimit: 1,
    weather: async () => {
      throw new Error();
    },
  });
  await request(limited)
    .post("/api/auth/login")
    .send({ username: "tester", password: "WrongPassword" });
  expect(
    (
      await request(limited)
        .post("/api/auth/login")
        .send({ username: "tester", password: "WrongPassword" })
    ).status,
  ).toBe(429);
});
test("database failures return controlled 503 and do not leak SQL details", async () => {
  const agent = request.agent(app);
  await register(agent);
  vi.spyOn(repos.products, "list").mockRejectedValue(
    new Error("SELECT password FROM Users host=secret"),
  );
  const res = await agent.get("/api/products");
  expect(res.status).toBe(503);
  expect(JSON.stringify(res.body)).not.toContain("SELECT");
});
