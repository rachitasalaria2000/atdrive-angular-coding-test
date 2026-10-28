import { Product, StoredUser, User, Order } from "./contracts";
export interface Repositories {
  products: {
    list(): Promise<Product[]>;
    find(id: string): Promise<Product | null>;
    create(p: Omit<Product, "id">): Promise<Product>;
    update(id: string, p: Omit<Product, "id">): Promise<Product | null>;
    delete(id: string): Promise<boolean>;
  };
  users: {
    findByName(name: string): Promise<StoredUser | null>;
    findById(id: number): Promise<User | null>;
    create(name: string, hash: string): Promise<User>;
  };
  orders: {
    list(userId: number): Promise<Order[]>;
    find(id: number, userId: number): Promise<Order | null>;
    create(userId: number, productIds: string[], total: number): Promise<Order>;
    update(
      id: number,
      userId: number,
      productIds: string[],
      total: number,
    ): Promise<Order | null>;
    delete(id: number, userId: number): Promise<boolean>;
    referencesProduct(id: string): Promise<boolean>;
  };
  health(): Promise<boolean>;
}
