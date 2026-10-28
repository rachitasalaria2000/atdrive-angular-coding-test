import "dotenv/config";
import { readConfig } from "./config";
import { connectDatabases } from "./database";
import { createApp } from "./app";
import { createWeatherService } from "./weather";
async function main() {
  const config = readConfig();
  const db = await connectDatabases(config);
  const app = createApp(db.repos, {
    secret: config.JWT_SECRET,
    production: config.NODE_ENV === "production",
    origin: config.APP_ORIGIN,
    weather: createWeatherService(),
  });
  const server = app.listen(config.PORT, () =>
    console.log(
      `Stockroom API + production web app: http://localhost:${config.PORT}`,
    ),
  );
  const stop = () => {
    server.close(() => {
      db.close().then(() => process.exit(0));
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
main().catch(() => {
  console.error(
    "Startup failed. Check .env, start MongoDB/MySQL, and run npm run db:init.",
  );
  process.exitCode = 1;
});
