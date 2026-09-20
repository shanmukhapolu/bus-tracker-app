import { describe, expect, it } from "vitest";
import { createMockBuses } from "../data/mockBuses";
import {
  filterBuses,
  interpolatePosition,
  statusLabel,
  updatedLabel,
} from "./buses";

describe("bus search and presentation", () => {
  const buses = createMockBuses();

  it("matches bus numbers and routes regardless of case or whitespace", () => {
    expect(filterBuses(buses, " bus 218 ").map((bus) => bus.id)).toEqual([
      "218",
    ]);
    expect(filterBuses(buses, "route c").map((bus) => bus.id)).toEqual(["218"]);
    expect(filterBuses(buses, "H").map((bus) => bus.id)).toEqual(["224"]);
    expect(filterBuses(buses, "")).toHaveLength(6);
    expect(filterBuses(buses, "999")).toEqual([]);
  });

  it("interpolates samples and clamps delayed frames to the endpoint", () => {
    expect(interpolatePosition([-86, 39], [-85, 40], 0.5)).toEqual([
      -85.5, 39.5,
    ]);
    expect(interpolatePosition([-86, 39], [-85, 40], 2)).toEqual([-85, 40]);
    expect(interpolatePosition([-86, 39], [-85, 40], -1)).toEqual([-86, 39]);
  });

  it("handles missing delay values, offline buses, and clock skew", () => {
    expect(
      statusLabel({ ...buses[0], status: "late", delayMinutes: undefined }),
    ).toBe("Delayed");
    expect(statusLabel({ ...buses[0], status: "offline" })).toBe(
      "Not tracking",
    );
    expect(
      statusLabel({ ...buses[0], status: "on-time", trackingActive: true }),
    ).toBe("Live now");

    const time = new Date("2026-09-07T12:00:00Z");
    expect(updatedLabel(time, time.getTime() - 1000)).toBe("Just now");
    expect(updatedLabel(time, time.getTime() + 1000)).toBe("1 second ago");
    expect(updatedLabel(time, time.getTime() + 8000)).toBe("8 seconds ago");
    expect(updatedLabel(time, time.getTime() + 120000)).toBe("2 minutes ago");
  });
});
