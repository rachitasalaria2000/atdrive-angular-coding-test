import bcrypt from "bcrypt";
import { Repositories } from "./repositories";
export const DEMO_USERNAME = "demo_user";
export const DEMO_PASSWORD = "DemoLogin123!";
export async function seedDemoUser(repos: Repositories): Promise<boolean> {
  if (await repos.users.findByName(DEMO_USERNAME)) return false;
  await repos.users.create(DEMO_USERNAME, await bcrypt.hash(DEMO_PASSWORD, 12));
  return true;
}
