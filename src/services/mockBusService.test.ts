import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockBusService,
  MOCK_UPDATE_INTERVAL_MS,
} from "./mockBusService";
import { demoRoute } from "../data/mockBuses";

afterEach(() => vi.useRealTimers());

describe("mock tracking service", () => {
  it("publishes every ten seconds and stops after the last subscriber leaves", () => {
    vi.useFakeTimers();
    const service = createMockBusService();
    const notify = vi.fn();
    const unsubscribe = service.subscribe(notify);
    const initial = service.getSnapshot();
    expect(initial.buses).toHaveLength(6);
    expect(service.getSnapshot()).toBe(initial);
    vi.advanceTimersByTime(MOCK_UPDATE_INTERVAL_MS - 1);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    const next = service.getSnapshot();
    expect(next).not.toBe(initial);
    expect(next.buses.find((bus) => bus.id === "218")?.latitude).toBe(
      demoRoute[1][1],
    );
    expect(
      next.buses[0].lastUpdated.getTime() -
        initial.buses[0].lastUpdated.getTime(),
    ).toBe(MOCK_UPDATE_INTERVAL_MS);
    expect(next.buses[0].latitude).toBe(initial.buses[0].latitude);
    unsubscribe();
    vi.advanceTimersByTime(MOCK_UPDATE_INTERVAL_MS * 2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares a timer, survives resubscription, and reverses without jumping", () => {
    vi.useFakeTimers();
    const service = createMockBusService();
    const stopA = service.subscribe(vi.fn());
    const stopB = service.subscribe(vi.fn());
    expect(vi.getTimerCount()).toBe(1);
    stopA();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(MOCK_UPDATE_INTERVAL_MS * (demoRoute.length - 1));
    expect(
      service.getSnapshot().buses.find((bus) => bus.id === "218")?.latitude,
    ).toBe(demoRoute.at(-1)?.[1]);
    vi.advanceTimersByTime(MOCK_UPDATE_INTERVAL_MS);
    expect(
      service.getSnapshot().buses.find((bus) => bus.id === "218")?.latitude,
    ).toBe(demoRoute.at(-2)?.[1]);
    stopB();
    const notify = vi.fn();
    const stopC = service.subscribe(notify);
    vi.advanceTimersByTime(MOCK_UPDATE_INTERVAL_MS);
    expect(notify).toHaveBeenCalledTimes(1);
    stopC();
    expect(vi.getTimerCount()).toBe(0);
  });
});
