import { Product } from "./contracts";
import { HttpError } from "./errors";
export async function calculateOrder(
  ids: string[],
  find: (id: string) => Promise<Product | null>,
): Promise<number> {
  const products = await Promise.all(ids.map(find));
  if (products.some((p) => !p))
    throw new HttpError(
      400,
      "One or more products no longer exist. Refresh the catalog.",
    );
  return (
    products.reduce((cents, p) => cents + Math.round(p!.price * 100), 0) / 100
  );
}
