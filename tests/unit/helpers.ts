import { Repositories } from "../../server/repositories";
import { Product, StoredUser, Order } from "../../server/contracts";
import { HttpError } from "../../server/errors";
export function memoryRepositories(): Repositories {
  const products = new Map<string, Product>(),
    users = new Map<number, StoredUser>(),
    orders = new Map<number, Order>();
  let nextProduct = 1,
    nextUser = 1,
    nextOrder = 1;
  return {
    products: {
      async list() {
        return [...products.values()];
      },
      async find(id) {
        return products.get(id) ?? null;
      },
      async create(input) {
        const p = {
          ...input,
          id: (nextProduct++).toString(16).padStart(24, "0"),
        };
        products.set(p.id, p);
        return p;
      },
      async update(id, input) {
        if (!products.has(id)) return null;
        const p = { ...input, id };
        products.set(id, p);
        return p;
      },
      async delete(id) {
        return products.delete(id);
      },
    },
    users: {
      async findByName(name) {
        return [...users.values()].find((u) => u.username === name) ?? null;
      },
      async findById(id) {
        const u = users.get(id);
        return u ? { id: u.id, username: u.username } : null;
      },
      async create(name, hash) {
        if ([...users.values()].some((u) => u.username === name))
          throw new HttpError(409, "Username already exists.");
        const user = { id: nextUser++, username: name, password: hash };
        users.set(user.id, user);
        return { id: user.id, username: name };
      },
    },
    orders: {
      async list(userId) {
        return [...orders.values()].filter((o) => o.userId === userId);
      },
      async find(id, userId) {
        const o = orders.get(id);
        return o?.userId === userId ? o : null;
      },
      async create(userId, productIds, totalAmount) {
        const o = { orderId: nextOrder++, userId, productIds, totalAmount };
        orders.set(o.orderId, o);
        return o;
      },
      async update(id, userId, productIds, totalAmount) {
        const o = orders.get(id);
        if (!o || o.userId !== userId) return null;
        const updated = { ...o, productIds, totalAmount };
        orders.set(id, updated);
        return updated;
      },
      async delete(id, userId) {
        if (orders.get(id)?.userId !== userId) return false;
        return orders.delete(id);
      },
      async referencesProduct(id) {
        return [...orders.values()].some((o) => o.productIds.includes(id));
      },
    },
    async health() {
      return true;
    },
  };
}
