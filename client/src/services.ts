import { Injectable, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { User, Product, Order, Weather } from "./models";
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return typeof error.error?.error === "string"
      ? error.error.error
      : error.status === 0
        ? "Cannot connect to the server. Check that the API is running."
        : "Request failed. Please retry.";
  }
  return "Something went wrong. Please retry.";
}
@Injectable({ providedIn: "root" })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly error = signal("");
  async restore() {
    try {
      this.user.set(await firstValueFrom(this.http.get<User>("/api/auth/me")));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status !== 401)
        this.error.set(errorMessage(error));
    } finally {
      this.ready.set(true);
    }
  }
  async authenticate(
    mode: "login" | "register",
    username: string,
    password: string,
  ) {
    const user = await firstValueFrom(
      this.http.post<User>("/api/auth/" + mode, { username, password }),
    );
    this.error.set("");
    this.user.set(user);
  }
  async logout() {
    await firstValueFrom(this.http.post("/api/auth/logout", {}));
    this.user.set(null);
  }
  clear() {
    this.user.set(null);
  }
}
@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private http = inject(HttpClient);
  readonly products = signal<Product[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly error = signal("");
  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      const [products, orders] = await Promise.all([
        firstValueFrom(this.http.get<Product[]>("/api/products")),
        firstValueFrom(this.http.get<Order[]>("/api/orders")),
      ]);
      this.products.set(products);
      this.orders.set(orders);
    } catch (error) {
      this.error.set(errorMessage(error));
      throw error;
    } finally {
      this.loading.set(false);
    }
  }
  async saveProduct(value: Omit<Product, "id">, id?: string) {
    const result = await firstValueFrom(
      id
        ? this.http.put<Product>("/api/products/" + id, value)
        : this.http.post<Product>("/api/products", value),
    );
    this.products.update((items) =>
      [...items.filter((i) => i.id !== result.id), result].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }
  async deleteProduct(id: string) {
    await firstValueFrom(this.http.delete("/api/products/" + id));
    this.products.update((items) => items.filter((p) => p.id !== id));
  }
  async saveOrder(productIds: string[], id?: number) {
    const value = { productIds };
    const result = await firstValueFrom(
      id
        ? this.http.put<Order>("/api/orders/" + id, value)
        : this.http.post<Order>("/api/orders", value),
    );
    this.orders.update((items) =>
      [result, ...items.filter((i) => i.orderId !== result.orderId)].sort(
        (a, b) => b.orderId - a.orderId,
      ),
    );
  }
  async deleteOrder(id: number) {
    await firstValueFrom(this.http.delete("/api/orders/" + id));
    this.orders.update((items) => items.filter((o) => o.orderId !== id));
  }
  reset() {
    this.products.set([]);
    this.orders.set([]);
    this.error.set("");
  }
}
@Injectable({ providedIn: "root" })
export class WeatherService {
  private http = inject(HttpClient);
  private sequence = 0;
  readonly city = signal("delhi");
  readonly data = signal<Weather | null>(null);
  readonly loading = signal(false);
  readonly error = signal("");
  async load(city = this.city()) {
    const sequence = ++this.sequence;
    this.city.set(city);
    this.loading.set(true);
    this.error.set("");
    this.data.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<Weather>("/api/weather", { params: { city } }),
      );
      if (sequence === this.sequence) this.data.set(data);
    } catch (error) {
      if (sequence === this.sequence) this.error.set(errorMessage(error));
    } finally {
      if (sequence === this.sequence) this.loading.set(false);
    }
  }
}
