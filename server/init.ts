import "dotenv/config";
import { readConfig } from "./config";
import { connectDatabases, initialize } from "./database";
async function main() {
  const db = await connectDatabases(readConfig());
  try {
    await initialize(db.pool);
    console.log("Users and Orders tables are ready.");
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error("Database setup failed. Check .env and database services.");
  process.exitCode = 1;
});
