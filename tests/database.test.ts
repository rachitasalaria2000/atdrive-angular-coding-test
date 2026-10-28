import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mysql from "mysql2/promise";
import { connectDatabases, initialize } from "../server/database";
import { readConfig } from "../server/config";
import { createApp } from "../server/app";
import "dotenv/config";
test(
  "real MongoDB + MySQL authentication, product persistence, FK and order lifecycle",
  { skip: !process.env.RUN_DATABASE_TESTS },
  async () => {
    const config = readConfig();
    if (
      config.MYSQL_DATABASE !== "atdrive_test" ||
      !config.MONGODB_URI.includes("atdrive_test")
    )
      throw new Error("Use dedicated atdrive_test databases only.");
    const db = await connectDatabases(config);
    try {
      await initialize(db.pool);
      const app = createApp(db.repos, {
        secret: config.JWT_SECRET,
        authLimit: 100,
        weather: async () => {
          throw new Error();
        },
      });
      const agent = request.agent(app);
      const username = "dbuser_" + Date.now();
      let res = await agent
        .post("/api/auth/register")
        .send({ username, password: "StrongPassword1!" });
      assert.equal(res.status, 201);
      const userId = res.body.id;
      const saved = await db.repos.users.findByName(username);
      assert.match(saved!.password, /^\$2[aby]\$/);
      assert.notEqual(saved!.password, "StrongPassword1!");
      await agent.post("/api/auth/logout");
      res = await agent
        .post("/api/auth/login")
        .send({ username, password: "StrongPassword1!" });
      assert.equal(res.status, 200);
      res = await agent.post("/api/products").send({
        name: "Database test " + username,
        price: 19.95,
        description: "Real Mongo persistence",
      });
      assert.equal(res.status, 201);
      const product = res.body;
      assert.equal((await db.repos.products.find(product.id))?.price, 19.95);
      res = await agent.post("/api/orders").send({ productIds: [product.id] });
      assert.equal(res.status, 201);
      const orderId = res.body.orderId;
      assert.equal(res.body.totalAmount, 19.95);
      assert.equal(res.body.userId, userId);
      assert.equal((await agent.get("/api/orders/" + orderId)).status, 200);
      res = await agent.put("/api/products/" + product.id).send({
        ...{ name: product.name, price: 25.5, description: "Updated" },
      });
      assert.equal(res.status, 200);
      res = await agent
        .put("/api/orders/" + orderId)
        .send({ productIds: [product.id] });
      assert.equal(res.body.totalAmount, 25.5);
      assert.equal(
        (await agent.delete("/api/products/" + product.id)).status,
        409,
      );
      await assert.rejects(
        db.pool.execute(
          "INSERT INTO Orders(userId,productIds,totalAmount) VALUES(?,?,?)",
          [4294967294, JSON.stringify([product.id]), 1],
        ),
        { code: "ER_NO_REFERENCED_ROW_2" },
      );
      assert.equal((await agent.delete("/api/orders/" + orderId)).status, 204);
      assert.equal(
        (await agent.delete("/api/products/" + product.id)).status,
        204,
      );
      assert.equal(await db.repos.products.find(product.id), null);
      await db.pool.execute("DELETE FROM Users WHERE id=?", [userId]);
    } finally {
      await db.close();
    }
  },
);
