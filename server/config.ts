import { z } from "zod";
export function readConfig() {
  return z
    .object({
      PORT: z.coerce.number().int().min(1).max(65535).default(3002),
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      MONGODB_URI: z.string().min(1),
      MYSQL_HOST: z.string().default("127.0.0.1"),
      MYSQL_PORT: z.coerce.number().int().default(3307),
      MYSQL_DATABASE: z.string().regex(/^[a-zA-Z0-9_]+$/),
      MYSQL_USER: z.string().min(1),
      MYSQL_PASSWORD: z.string(),
      JWT_SECRET: z
        .string()
        .min(32)
        .refine(
          (s) => !s.startsWith("replace_with_"),
          "Set a generated JWT_SECRET",
        ),
      APP_ORIGIN: z.string().url().default("http://localhost:3002"),
    })
    .parse(process.env);
}
