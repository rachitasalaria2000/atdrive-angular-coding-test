import "@angular/compiler";
import {
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { of, throwError } from "rxjs";
import { expect, test, vi } from "vitest";
import { WorkspaceService, WeatherService } from "../../client/src/services";
function service<T>(type: new () => T, http: object) {
  const injector = createEnvironmentInjector(
    [{ provide: HttpClient, useValue: http }],
    null as never,
  );
  return runInInjectionContext(injector, () => new type());
}
test("Angular service updates shared product state after a save/delete", async () => {
  const product = { id: "one", name: "Lamp", price: 1, description: "" };
  const http = {
    get: vi.fn((url) => of(url === "/api/products" ? [product] : [])),
    post: vi.fn().mockReturnValue(of({ ...product, id: "two", name: "Chair" })),
    delete: vi.fn().mockReturnValue(of(null)),
  };
  const store = service(WorkspaceService, http);
  await store.load();
  expect(store.products()).toHaveLength(1);
  await store.saveProduct({ name: "Chair", price: 1, description: "" });
  expect(store.products()).toHaveLength(2);
  await store.deleteProduct("one");
  expect(store.products()[0].name).toBe("Chair");
});
test("Angular load failure exposes retryable state and ends loading", async () => {
  const store = service(WorkspaceService, {
    get: () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { error: "Database unavailable" },
          }),
      ),
  });
  await expect(store.load()).rejects.toThrow();
  expect(store.loading()).toBe(false);
  expect(store.error()).toBe("Database unavailable");
});
test("weather service exposes an error instead of fabricated data", async () => {
  const weather = service(WeatherService, {
    get: () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 502,
            error: { error: "Weather unavailable" },
          }),
      ),
  });
  await weather.load();
  expect(weather.data()).toBeNull();
  expect(weather.error()).toBe("Weather unavailable");
  expect(weather.loading()).toBe(false);
});
