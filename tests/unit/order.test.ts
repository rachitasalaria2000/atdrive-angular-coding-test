import { expect, test, vi } from "vitest";
import { calculateOrder } from "../../server/order-service";
import { orderInput, productInput, credentials } from "../../server/contracts";
const id = "0123456789abcdef01234567";
test("uses stored product prices and calculates decimal totals in cents", async () => {
  const find = vi
    .fn()
    .mockResolvedValueOnce({ id, price: 0.1 })
    .mockResolvedValueOnce({ id: "abcdef0123456789abcdef01", price: 0.2 });
  expect(await calculateOrder([id, "abcdef0123456789abcdef01"], find)).toBe(
    0.3,
  );
});
test("rejects an order when any product is absent", async () => {
  await expect(calculateOrder([id], async () => null)).rejects.toMatchObject({
    status: 400,
  });
});
test("rejects duplicates, client totals, negative prices, and excessive precision", () => {
  expect(orderInput.safeParse({ productIds: [id, id] }).success).toBe(false);
  expect(
    orderInput.safeParse({ productIds: [id], totalAmount: 1 }).success,
  ).toBe(false);
  expect(
    productInput.safeParse({ name: "X", price: -1, description: "" }).success,
  ).toBe(false);
  expect(
    productInput.safeParse({ name: "X", price: 1.234, description: "" })
      .success,
  ).toBe(false);
});
test("rejects bcrypt inputs longer than 72 UTF-8 bytes", () => {
  expect(
    credentials.safeParse({ username: "tester", password: "é".repeat(40) })
      .success,
  ).toBe(false);
});
test("case variants of the same MongoDB ID cannot be ordered twice", () => {
  expect(
    orderInput.safeParse({ productIds: [id, id.toUpperCase()] }).success,
  ).toBe(false);
});
