import { z } from "zod";
export const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid product ID")
  .toLowerCase();
export const productInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    price: z
      .number()
      .finite()
      .min(0)
      .max(1000000)
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
        "Price supports at most two decimal places",
      ),
    description: z.string().trim().max(2000),
  })
  .strict();
export const credentials = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z][a-z0-9_]{2,39}$/,
        "Use 3–40 letters, numbers or underscores; start with a letter",
      ),
    password: z
      .string()
      .min(8)
      .refine(
        (s) => Buffer.byteLength(s, "utf8") <= 72,
        "Password must fit within 72 UTF-8 bytes",
      ),
  })
  .strict();
export const orderInput = z
  .object({
    productIds: z
      .array(objectId)
      .min(1)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose each product once",
      ),
  })
  .strict();
export function parseId(raw: unknown): number {
  const n = z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(raw);
  return n;
}
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}
export interface User {
  id: number;
  username: string;
}
export interface StoredUser extends User {
  password: string;
}
export interface Order {
  orderId: number;
  userId: number;
  productIds: string[];
  totalAmount: number;
}
export interface Weather {
  city: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  observedAt: string;
  fetchedAt: string;
  stale: boolean;
}
