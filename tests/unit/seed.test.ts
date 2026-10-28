import { expect, test } from "vitest";
import bcrypt from "bcrypt";
import {
  seedDemoUser,
  DEMO_USERNAME,
  DEMO_PASSWORD,
} from "../../server/seed-service";
import { memoryRepositories } from "./helpers";
test("demo login is bcrypt-hashed and reseeding never overwrites the account", async () => {
  const repos = memoryRepositories();
  expect(await seedDemoUser(repos)).toBe(true);
  const before = await repos.users.findByName(DEMO_USERNAME);
  expect(before!.password).not.toBe(DEMO_PASSWORD);
  expect(await bcrypt.compare(DEMO_PASSWORD, before!.password)).toBe(true);
  expect(await seedDemoUser(repos)).toBe(false);
  const after = await repos.users.findByName(DEMO_USERNAME);
  expect(after!.id).toBe(before!.id);
  expect(after!.password).toBe(before!.password);
});
