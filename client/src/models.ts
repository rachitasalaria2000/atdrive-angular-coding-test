export interface User {
  id: number;
  username: string;
}
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
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
