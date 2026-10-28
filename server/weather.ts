import { z } from "zod";
import { Weather } from "./contracts";
import { HttpError } from "./errors";
const cities = {
  delhi: { name: "New Delhi", lat: 28.61, lon: 77.21 },
  bengaluru: { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  london: { name: "London", lat: 51.51, lon: -0.13 },
};
const responseSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number().finite(),
    relative_humidity_2m: z.number().min(0).max(100),
    wind_speed_10m: z.number().min(0),
    weather_code: z.number().int(),
  }),
});
export function createWeatherService(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const cache = new Map<string, { data: Weather; time: number }>();
  return async (raw: string): Promise<Weather> => {
    const key = z.enum(["delhi", "bengaluru", "london"]).parse(raw);
    const city = cities[key];
    const cached = cache.get(key);
    if (cached && now() - cached.time < 300000) return cached.data;
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(city.lat),
        longitude: String(city.lon),
        current:
          "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
        timezone: "UTC",
      }).toString();
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("upstream");
      const { current } = responseSchema.parse(await response.json());
      const data: Weather = {
        city: city.name,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        observedAt: current.time.endsWith("Z")
          ? current.time
          : current.time + "Z",
        fetchedAt: new Date(now()).toISOString(),
        stale: false,
      };
      cache.set(key, { data, time: now() });
      return data;
    } catch {
      if (cached && now() - cached.time < 3600000)
        return { ...cached.data, stale: true };
      throw new HttpError(
        502,
        "Weather is temporarily unavailable. Please retry.",
      );
    }
  };
}
