import { describe, expect, it } from "vitest";
import { normalizeRoutes } from "./routeService";

describe("driver route data", () => {
  it("normalizes enabled routes and orders their stops", () => {
    const routes = normalizeRoutes({
      A: {
        name: "Route A",
        school: "Carmel High School",
        enabled: true,
        stops: {
          second: {
            name: "Second stop",
            address: "200 Main Street",
            latitude: 39.98,
            longitude: -86.12,
            order: 1,
          },
          first: {
            name: "First stop",
            latitude: 39.97,
            longitude: -86.13,
            order: 0,
          },
        },
      },
      hidden: { name: "Hidden", enabled: false },
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe("A");
    expect(routes[0].stops.map((stop) => stop.id)).toEqual(["first", "second"]);
  });

  it("drops malformed stops instead of exposing invalid coordinates", () => {
    const routes = normalizeRoutes({
      A: {
        name: "Route A",
        enabled: true,
        stops: {
          invalid: { name: "Missing coordinates", order: 0 },
        },
      },
    });
    expect(routes[0].stops).toEqual([]);
  });
});
