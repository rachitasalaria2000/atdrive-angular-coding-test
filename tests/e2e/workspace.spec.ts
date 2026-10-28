import { test, expect, Page } from "@playwright/test";
async function signUp(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByLabel("Username", { exact: true })
    .fill("browser_" + Date.now().toString(36));
  await page.getByLabel("Password", { exact: true }).fill("BrowserTest123!");
  await page.getByRole("button", { name: /Create your account/ }).click();
  await expect(
    page.getByRole("heading", { name: "The product shelf." }),
  ).toBeVisible();
}
test("register, product create/read/update/delete, search and persisted session", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signUp(page);
  const name = "Browser product " + Date.now();
  await page
    .getByRole("button", { name: "Add product", exact: false })
    .first()
    .click();
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByLabel("Price (INR)", { exact: true }).fill("45.75");
  await page
    .getByLabel("Description", { exact: false })
    .fill("Created through Angular UI");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add product", exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
  await page.getByLabel("Price (INR)", { exact: true }).fill("50.25");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("textbox", { name: "Search products" }).fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("50.25");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The product shelf." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete " + name, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/products-desktop.png",
    fullPage: true,
  });
});
test("create/update/delete an order from real catalog prices", async ({
  page,
}) => {
  await signUp(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: /Orders/ })
    .click();
  await page
    .getByRole("button", { name: "Create order", exact: false })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("checkbox").first().check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create order", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: /Edit order/ }).click();
  await page.getByRole("dialog").getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.locator(".order-products span")).toHaveCount(2);
  await page.getByRole("button", { name: /Delete order/ }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("heading", { name: "Your first order starts here." }),
  ).toBeVisible();
});
test("weather and product errors stay visible and recoverable", async ({
  page,
}) => {
  await page.route("**/api/weather*", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Weather unavailable for test" }),
    }),
  );
  await signUp(page);
  await expect(page.getByText("Weather unavailable for test")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry weather" }),
  ).toBeEnabled();
  await page.route("**/api/products", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Save unavailable for test" }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Add product", exact: false })
    .first()
    .click();
  await page.getByLabel("Product name", { exact: true }).fill("Failure test");
  await page.getByLabel("Price (INR)", { exact: true }).fill("1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add product", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "Save unavailable for test",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Add product", exact: true }),
  ).toBeEnabled();
});
test("mobile layout fits and logout returns to login", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/products-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
