require("dotenv").config({ quiet: true });
const { spawnSync } = require("node:child_process");
if (!process.env.MONGODB_URI) {
  console.error("Set up .env and start both databases first.");
  process.exit(1);
}
const mongo = new URL(process.env.MONGODB_URI);
mongo.pathname = "/atdrive_test";
const result = spawnSync(
  process.execPath,
  ["--test", "dist/tests/database.test.js"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_DATABASE_TESTS: "1",
      MYSQL_DATABASE: "atdrive_test",
      MONGODB_URI: mongo.toString(),
    },
  },
);
process.exit(result.status ?? 1);
