# Stockroom — Angular Coding Test

Product and order management with Angular 22, Node.js, Express, MongoDB, and MySQL. Angular services and signals manage the frontend state. Passwords use bcrypt; login uses an HttpOnly session cookie.

## Requirements

- Node.js 24 LTS, version **24.15 or newer** (tested with 24.19). Node 25 is not supported by this Angular version.
- npm and Docker Desktop with the engine running, or your own MongoDB 7+ and MySQL 8+ servers.
- Internet access for the Open-Meteo weather API. No third-party API key is needed.

## Setup and run

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d --wait
```

On macOS/Linux use `cp .env.example .env` for the copy step. Generate a session signing secret:

```shell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Paste the generated value into `JWT_SECRET` in your local `.env`, replacing the placeholder. Then run:

```shell
npm run db:init
npm run seed
npm run build
npm start
```

Open **http://localhost:3002** and choose **Create an account**. There is no preset login; register your own username and password. The optional seed creates four products only when the catalog is empty. `npm run dev` rebuilds the app and starts the same server; restart it after source changes.

## Environment configuration

| Variable | Purpose / local Docker value |
|---|---|
| `PORT` | Web/API port, `3002` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27028/atdrive_products` |
| `MYSQL_HOST`, `MYSQL_PORT` | `127.0.0.1`, `3307` |
| `MYSQL_DATABASE` | `atdrive` |
| `MYSQL_USER`, `MYSQL_PASSWORD` | `atdrive`, `local_dev_password` |
| `JWT_SECRET` | Your generated secret, at least 32 characters |
| `APP_ORIGIN` | Browser origin, `http://localhost:3002` |
| `NODE_ENV` | `development` locally; `production` enables HTTPS-only cookies |

If using existing database servers, update the URI, host, port, and credentials. Create the MySQL database and grant the application user access before running `db:init`. The Docker credentials are for local development only. Keep `.env` private; only `.env.example` belongs in Git.

## Features

- Products: create, list, retrieve, edit, delete, and search. Product records live in MongoDB.
- Users: registration, login, logout, and session restoration. The MySQL `Users` table contains auto-generated `id`, unique `username`, and a bcrypt hash in `password`.
- Orders: create, retrieve, edit, delete, and list your own orders. MySQL stores `orderId`, a foreign-key `userId` referencing `Users`, JSON `productIds`, and `totalAmount`.
- Totals are calculated on the server from MongoDB prices, using integer cents. The API rejects client-supplied user IDs/totals, duplicate products, and missing products. Each selected product appears once. Products used in an order cannot be deleted until removed from that order.
- The dashboard fetches current weather from Open-Meteo for New Delhi, Bengaluru, or London. Requests have a five-second timeout, five-minute caching, an explicitly labelled stale response during short outages, and a retryable error when no data is available.

All signed-in users share the product catalog. Orders are private to their owner. An order saves its total at creation; editing it recalculates the total at current prices. MongoDB product references cannot have SQL foreign keys; the application validates them. Production systems would also need coordination for concurrent cross-database changes.

## Tests

```shell
npm test
npm run typecheck
npm run test:integration
```

Unit/API tests cover validation, bcrypt, login/logout, product CRUD, order ownership/totals, throttling, service failures, Angular service state, and weather caching/errors. Integration tests require running MongoDB and MySQL and use **only** databases named `atdrive_test`; Docker creates the SQL test database automatically. For a native MySQL setup, create `atdrive_test` and grant the configured user access to it first.

Verified locally: **22 unit/API/service tests, 1 real MongoDB + MySQL integration test, and 4 browser tests passed**. The production build and strict TypeScript checks also passed.

For browser tests, leave the app running in another terminal:

```shell
npm run test:e2e
```

Playwright uses installed Microsoft Edge by default. For Chromium on another OS, remove `channel: 'msedge'` in `playwright.config.ts`, then run `npx playwright install chromium`. Browser tests cover registration, persistent sessions, product CRUD/search, order CRUD, errors/retries, and mobile logout. They create disposable users/products; they never use personal credentials.

## API

All product, order, and weather endpoints require a login cookie. Send JSON bodies.

| Method | Endpoint | Body / action |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | `{ "username": "yourname", "password": "your-password" }` |
| GET / POST | `/api/auth/me` / `/api/auth/logout` | Current user / clear session |
| GET / POST | `/api/products` | List / create `{ "name": "Lamp", "price": 25.50, "description": "Desk lamp" }` |
| GET / PUT / DELETE | `/api/products/:id` | Read / replace product fields / delete |
| GET / POST | `/api/orders` | List your orders / create `{ "productIds": ["MONGODB_PRODUCT_ID"] }` |
| GET / PUT / DELETE | `/api/orders/:orderId` | Read / replace `productIds` / delete your order |
| GET | `/api/weather?city=delhi` | Weather; also accepts `bengaluru` or `london` |
| GET | `/api/health` | Both database connections healthy |

Responses use 201 for creation, 204 for deletion, 400 for validation, 401 for authentication, 404 for absent/inaccessible records, 409 for conflicts, 429 for throttling, and 502/503 for unavailable services. SQL queries are parameterized; internal database errors and password hashes are not returned.

Frontend builds use Angular's AOT compiler and webpack with the Angular linker. Express serves the compiled frontend and API from the same origin; no separate frontend server is required.
