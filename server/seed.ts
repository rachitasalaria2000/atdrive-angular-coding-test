import "dotenv/config";
import { readConfig } from "./config";
import { connectDatabases } from "./database";
import { seedDemoUser } from "./seed-service";
async function main() {
  const config = readConfig();
  if (config.NODE_ENV === "production") {
    console.error("Demo seeding is disabled in production.");
    process.exitCode = 1;
    return;
  }
  const db = await connectDatabases(config);
  try {
    const created = await seedDemoUser(db.repos);
    console.log(
      created
        ? "Created local demo login: demo_user / DemoLogin123!"
        : "Existing demo_user preserved; its password was not changed.",
    );
    if ((await db.repos.products.list()).length) {
      console.log("Catalog is not empty; seed skipped.");
      return;
    }
    for (const p of [
      {
        name: "Studio headphones",
        price: 2499,
        description: "Over-ear headphones with a comfortable padded fit.",
      },
      {
        name: "Mechanical keyboard",
        price: 4299,
        description:
          "Compact keyboard with tactile switches and a detachable cable.",
      },
      {
        name: "Desk lamp",
        price: 1299,
        description: "Adjustable task lighting for a focused workspace.",
      },
      {
        name: "Laptop stand",
        price: 1799,
        description: "A raised aluminium stand for everyday desk setups.",
      },
    ])
      await db.repos.products.create(p);
    console.log("Created four sample products.");
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error("Seed failed. Check database configuration.");
  process.exitCode = 1;
});
