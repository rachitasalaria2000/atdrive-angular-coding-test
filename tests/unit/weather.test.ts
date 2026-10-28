import { expect, test, vi } from "vitest";
import { createWeatherService } from "../../server/weather";
const payload = {
  current: {
    time: "2026-10-28T12:00",
    temperature_2m: 24,
    relative_humidity_2m: 45,
    wind_speed_10m: 7,
    weather_code: 1,
  },
};
test("validates upstream payload, uses cache, and sends a bounded fetch signal", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload)));
  const service = createWeatherService(fetcher);
  expect(await service("delhi")).toMatchObject({
    city: "New Delhi",
    temperature: 24,
    stale: false,
  });
  await service("delhi");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
test("shows explicit stale cached data on failure within one hour", async () => {
  let time = 1000000;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
    .mockRejectedValue(new Error("down"));
  const service = createWeatherService(fetcher, () => time);
  await service("london");
  time += 310000;
  expect((await service("london")).stale).toBe(true);
  time += 3600000;
  await expect(service("london")).rejects.toMatchObject({ status: 502 });
});
test("malformed external payload and upstream errors are controlled failures", async () => {
  const service = createWeatherService(
    vi.fn().mockResolvedValue(new Response("{}")),
  );
  await expect(service("delhi")).rejects.toMatchObject({ status: 502 });
  const bad = createWeatherService(
    vi.fn().mockResolvedValue(new Response("", { status: 429 })),
  );
  await expect(bad("delhi")).rejects.toMatchObject({ status: 502 });
});
test("invalid cities never trigger an arbitrary upstream URL", async () => {
  const fetcher = vi.fn();
  await expect(
    createWeatherService(fetcher)("https://attacker.invalid"),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
