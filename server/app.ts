import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import path from "node:path";
import { existsSync } from "node:fs";
import { Repositories } from "./repositories";
import {
  productInput,
  credentials,
  orderInput,
  objectId,
  parseId,
  Weather,
} from "./contracts";
import { HttpError } from "./errors";
import { calculateOrder } from "./order-service";
export function createApp(
  repos: Repositories,
  options: {
    secret: string;
    production?: boolean;
    origin?: string;
    weather: (city: string) => Promise<Weather>;
    authLimit?: number;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please retry shortly." },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      const allowed = new Set([
        options.origin || "http://localhost:4200",
        "http://localhost:3002",
      ]);
      if (!allowed.has(req.headers.origin)) {
        next(new HttpError(403, "Untrusted request origin."));
        return;
      }
    }
    next();
  });
  const cookie = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: Boolean(options.production),
    path: "/",
    maxAge: 7200000,
  };
  const setSession = (res: Response, userId: number) =>
    res.cookie(
      "session",
      jwt.sign({ sub: String(userId) }, options.secret, {
        expiresIn: "2h",
        algorithm: "HS256",
        issuer: "atdrive-stockroom",
        audience: "atdrive-web",
      }),
      cookie,
    );
  const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = jwt.verify(req.cookies?.session || "", options.secret, {
        algorithms: ["HS256"],
        issuer: "atdrive-stockroom",
        audience: "atdrive-web",
      });
      if (typeof payload === "string" || !payload.sub) throw new Error();
      const user = await repos.users.findById(Number(payload.sub));
      if (!user) throw new HttpError(401, "Please sign in.");
      res.locals.user = user;
      next();
    } catch (error) {
      if (
        error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError ||
        error instanceof HttpError
      ) {
        next(new HttpError(401, "Please sign in."));
      } else next(error);
    }
  };
  const throttle = rateLimit({
    windowMs: 900000,
    limit: options.authLimit ?? 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  app.post("/api/auth/register", throttle, async (req, res) => {
    const data = credentials.parse(req.body);
    const hash = await bcrypt.hash(data.password, 12);
    const user = await repos.users.create(data.username, hash);
    setSession(res, user.id);
    res.status(201).json(user);
  });
  app.post("/api/auth/login", throttle, async (req, res) => {
    const data = credentials.parse(req.body);
    const user = await repos.users.findByName(data.username);
    const hash =
      user?.password ||
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    const valid = await bcrypt.compare(data.password, hash);
    if (!user || !valid)
      throw new HttpError(401, "Username or password is incorrect.");
    setSession(res, user.id);
    res.json({ id: user.id, username: user.username });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("session", {
      httpOnly: true,
      sameSite: "strict",
      secure: Boolean(options.production),
      path: "/",
    });
    res.status(204).end();
  });
  app.get("/api/auth/me", auth, (_req, res) => res.json(res.locals.user));
  app.get("/api/health", async (_req, res) => {
    const healthy = await repos.health();
    res
      .status(healthy ? 200 : 503)
      .json({ status: healthy ? "ok" : "unavailable" });
  });
  app.use(["/api/products", "/api/orders", "/api/weather"], auth);
  app.get("/api/products", async (_req, res) =>
    res.json(await repos.products.list()),
  );
  app.post("/api/products", async (req, res) => {
    const item = await repos.products.create(productInput.parse(req.body));
    res
      .location("/api/products/" + item.id)
      .status(201)
      .json(item);
  });
  app.get("/api/products/:id", async (req, res) => {
    const item = await repos.products.find(objectId.parse(req.params.id));
    if (!item) throw new HttpError(404, "Product not found.");
    res.json(item);
  });
  app.put("/api/products/:id", async (req, res) => {
    const item = await repos.products.update(
      objectId.parse(req.params.id),
      productInput.parse(req.body),
    );
    if (!item) throw new HttpError(404, "Product not found.");
    res.json(item);
  });
  app.delete("/api/products/:id", async (req, res) => {
    const id = objectId.parse(req.params.id);
    if (await repos.orders.referencesProduct(id))
      throw new HttpError(
        409,
        "This product is used in an order. Remove it from orders before deleting.",
      );
    if (!(await repos.products.delete(id)))
      throw new HttpError(404, "Product not found.");
    res.status(204).end();
  });
  app.get("/api/orders", async (_req, res) =>
    res.json(await repos.orders.list(res.locals.user.id)),
  );
  app.post("/api/orders", async (req, res) => {
    const { productIds } = orderInput.parse(req.body);
    const total = await calculateOrder(productIds, repos.products.find);
    const item = await repos.orders.create(
      res.locals.user.id,
      productIds,
      total,
    );
    res
      .location("/api/orders/" + item.orderId)
      .status(201)
      .json(item);
  });
  app.get("/api/orders/:id", async (req, res) => {
    const item = await repos.orders.find(
      parseId(req.params.id),
      res.locals.user.id,
    );
    if (!item) throw new HttpError(404, "Order not found.");
    res.json(item);
  });
  app.put("/api/orders/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await repos.orders.find(id, res.locals.user.id)))
      throw new HttpError(404, "Order not found.");
    const { productIds } = orderInput.parse(req.body);
    const total = await calculateOrder(productIds, repos.products.find);
    const item = await repos.orders.update(
      id,
      res.locals.user.id,
      productIds,
      total,
    );
    if (!item) throw new HttpError(404, "Order not found.");
    res.json(item);
  });
  app.delete("/api/orders/:id", async (req, res) => {
    if (
      !(await repos.orders.delete(parseId(req.params.id), res.locals.user.id))
    )
      throw new HttpError(404, "Order not found.");
    res.status(204).end();
  });
  app.get("/api/weather", async (req, res) => {
    res.json(
      await options.weather(
        typeof req.query.city === "string" ? req.query.city : "delhi",
      ),
    );
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API endpoint not found.")),
  );
  const clientPath = path.resolve(process.cwd(), "dist/client/browser");
  if (existsSync(clientPath)) {
    app.use(express.static(clientPath));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(clientPath, "index.html")),
    );
  }
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Please check the submitted values.",
          details: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON body." });
        return;
      }
      if (
        typeof error === "object" &&
        error &&
        "type" in error &&
        error.type === "entity.too.large"
      ) {
        res.status(413).json({ error: "Request body is too large." });
        return;
      }
      res.status(503).json({
        error: "The service is temporarily unavailable. Please retry.",
      });
    },
  );
  return app;
}
