import { Component, inject, signal, computed, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import {
  ReactiveFormsModule,
  FormControl,
  FormGroup,
  Validators,
} from "@angular/forms";
import { HttpErrorResponse } from "@angular/common/http";
import {
  AuthService,
  WorkspaceService,
  WeatherService,
  errorMessage,
} from "./services";
import { Product, Order } from "./models";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: "./app.html",
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly store = inject(WorkspaceService);
  readonly weather = inject(WeatherService);
  readonly page = signal<"products" | "orders">("products");
  readonly authMode = signal<"login" | "register">("login");
  readonly busy = signal(false);
  readonly error = signal("");
  readonly toast = signal("");
  readonly search = signal("");
  readonly productModal = signal(false);
  readonly editingProduct = signal<Product | null>(null);
  readonly orderModal = signal(false);
  readonly editingOrder = signal<Order | null>(null);
  readonly selected = signal<Set<string>>(new Set());
  readonly confirmDelete = signal<Product | Order | null>(null);
  readonly authForm = new FormGroup({
    username: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^[a-zA-Z][a-zA-Z0-9_]{2,39}$/),
      ],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });
  readonly productForm = new FormGroup({
    name: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    price: new FormControl(0, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(0),
        Validators.max(1000000),
      ],
    }),
    description: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
  });
  readonly filtered = computed(() => {
    const query = this.search().toLowerCase();
    return this.store
      .products()
      .filter((p) =>
        (p.name + " " + p.description).toLowerCase().includes(query),
      );
  });
  readonly catalogValue = computed(
    () =>
      this.store
        .products()
        .reduce((sum, p) => sum + Math.round(p.price * 100), 0) / 100,
  );
  readonly orderValue = computed(
    () =>
      this.store
        .orders()
        .reduce((sum, o) => sum + Math.round(o.totalAmount * 100), 0) / 100,
  );
  readonly previewTotal = computed(
    () =>
      this.store
        .products()
        .filter((p) => this.selected().has(p.id))
        .reduce((sum, p) => sum + Math.round(p.price * 100), 0) / 100,
  );
  async ngOnInit() {
    await this.auth.restore();
    if (this.auth.user()) await this.loadWorkspace();
  }
  async loadWorkspace() {
    try {
      await this.store.load();
    } catch (error) {
      this.handle(error);
    }
    void this.weather.load();
  }
  handle(error: unknown) {
    this.error.set(errorMessage(error));
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.clear();
      this.store.reset();
      this.productModal.set(false);
      this.orderModal.set(false);
      this.confirmDelete.set(null);
    }
  }
  async signIn() {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set("");
    try {
      const { username, password } = this.authForm.getRawValue();
      await this.auth.authenticate(this.authMode(), username, password);
      this.authForm.controls.password.reset();
      window.scrollTo({ top: 0 });
      await this.loadWorkspace();
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(false);
    }
  }
  async signOut() {
    this.busy.set(true);
    try {
      await this.auth.logout();
      this.authMode.set("login");
      this.authForm.reset();
      this.store.reset();
      this.error.set("");
      this.toast.set("");
      this.closeModals();
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(false);
    }
  }
  switchAuth() {
    this.authMode.update((v) => (v === "login" ? "register" : "login"));
    this.error.set("");
    this.auth.error.set("");
  }
  changeSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }
  changeCity(event: Event) {
    void this.weather.load((event.target as HTMLSelectElement).value);
  }
  openProduct(p?: Product) {
    this.editingProduct.set(p ?? null);
    this.productForm.reset(
      p
        ? { name: p.name, price: p.price, description: p.description }
        : { name: "", price: 0, description: "" },
    );
    this.error.set("");
    this.productModal.set(true);
  }
  async saveProduct() {
    if (
      this.productForm.invalid ||
      !this.productForm.controls.name.value.trim()
    ) {
      this.productForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set("");
    try {
      await this.store.saveProduct(
        this.productForm.getRawValue(),
        this.editingProduct()?.id,
      );
      this.productModal.set(false);
      this.toast.set(
        this.editingProduct() ? "Product updated." : "Product added.",
      );
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(false);
    }
  }
  openOrder(o?: Order) {
    this.editingOrder.set(o ?? null);
    this.selected.set(new Set(o?.productIds ?? []));
    this.error.set("");
    this.orderModal.set(true);
  }
  toggleProduct(id: string) {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async saveOrder() {
    if (!this.selected().size) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.store.saveOrder(
        [...this.selected()],
        this.editingOrder()?.orderId,
      );
      this.orderModal.set(false);
      this.toast.set(this.editingOrder() ? "Order updated." : "Order created.");
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(false);
    }
  }
  productName(id: string) {
    return (
      this.store.products().find((p) => p.id === id)?.name ??
      "Unavailable product"
    );
  }
  askDelete(item: Product | Order) {
    this.error.set("");
    this.confirmDelete.set(item);
  }
  deleteLabel() {
    const item = this.confirmDelete();
    return item && "orderId" in item
      ? "order #" + item.orderId
      : item && "name" in item
        ? item.name
        : "";
  }
  async deleteConfirmed() {
    const item = this.confirmDelete();
    if (!item) return;
    this.busy.set(true);
    this.error.set("");
    try {
      if ("orderId" in item) await this.store.deleteOrder(item.orderId);
      else await this.store.deleteProduct(item.id);
      this.confirmDelete.set(null);
      this.toast.set("Deleted successfully.");
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(false);
    }
  }
  closeModals() {
    if (this.busy()) return;
    this.productModal.set(false);
    this.orderModal.set(false);
    this.confirmDelete.set(null);
    this.error.set("");
  }
  weatherLabel(code: number) {
    if (code === 0) return "Clear skies";
    if (code < 4) return "Partly cloudy";
    if (code < 50) return "Low visibility";
    if (code < 70) return "Rainy conditions";
    if (code < 80) return "Snow conditions";
    return "Showers & storms";
  }
}
