import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_db: unknown, path?: string) => path ?? "/"),
  get: vi.fn(async (_path: string): Promise<{ exists: () => boolean; val: () => unknown }> => ({ exists: () => false, val: () => null })),
  update: vi.fn(async (_reference: unknown, _updates: Record<string, unknown>) => undefined),
  set: vi.fn(async (_reference: unknown, _value: unknown) => undefined),
  serverTimestamp: vi.fn(() => 1234),
  auth: { currentUser: { uid: "admin-1", email: "admin@example.test" } },
}));

vi.mock("../config/firebase", () => ({
  getFirebaseRuntime: async () => ({
    db: {},
    auth: firebase.auth,
    ref: firebase.ref,
    get: firebase.get,
    update: firebase.update,
    set: firebase.set,
    serverTimestamp: firebase.serverTimestamp,
  }),
}));

import { addFleetBus, assignDriverToBus, deleteFleetBus } from "./fleetService";

function writtenRecords() {
  return Object.fromEntries(
    firebase.set.mock.calls.map(([reference, value]) => [String(reference), value]),
  ) as Record<string, unknown>;
}

function snapshot(value: unknown) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value,
  };
}

beforeEach(() => {
  firebase.ref.mockClear();
  firebase.get.mockReset();
  firebase.update.mockReset();
  firebase.set.mockReset();
  firebase.serverTimestamp.mockClear();
});

describe("fleet bus management", () => {
  it("creates private and public bus records with an audit entry", async () => {
    firebase.get.mockResolvedValue(snapshot(null));

    const created = await addFleetBus(" 218 ", " North ");

    expect(created).toMatchObject({
      id: "218",
      busNumber: "218",
      route: "North",
      enabled: true,
    });
    const updates = writtenRecords();
    expect(updates["buses/218"]).toMatchObject({
      busNumber: "218",
      route: "North",
      enabled: true,
      lifecycleStatus: "active",
    });
    expect(updates["publicBuses/218"]).toEqual({
      busNumber: "218",
      route: "North",
      enabled: true,
      active: false,
    });
    const auditPath = Object.keys(updates).find((path) => path.startsWith("auditLogs/"));
    expect(auditPath).toBeTruthy();
    const writePaths = firebase.set.mock.calls.map(([reference]) => String(reference));
    expect(writePaths.indexOf("buses/218")).toBeLessThan(writePaths.indexOf("publicBuses/218"));
    expect(writePaths.indexOf("publicBuses/218")).toBeLessThan(writePaths.indexOf(auditPath ?? ""));
    expect(firebase.update).not.toHaveBeenCalled();
    expect(firebase.ref).not.toHaveBeenCalledWith({}, "");
    expect(firebase.ref).not.toHaveBeenCalledWith({});
  });

  it("rejects duplicate bus numbers", async () => {
    firebase.get.mockResolvedValue(snapshot({ busNumber: "218" }));

    await expect(addFleetBus("218", "North")).rejects.toThrow(
      "Bus 218 already exists.",
    );
    expect(firebase.update).not.toHaveBeenCalled();
  });

  it("rejects invalid Firebase key characters", async () => {
    await expect(addFleetBus("21/8", "North")).rejects.toThrow(
      "Bus number must be 1–20 characters",
    );
    expect(firebase.get).not.toHaveBeenCalled();
  });

  it("assigns an enabled driver to an existing bus and audits the change", async () => {
    const driver = {
      displayName: "Driver One",
      enabled: true,
      assignedBus: "",
      approvalStatus: "approved",
    };
    firebase.get.mockImplementation(async (path: string) => {
      if (path === "drivers/driver-1") return snapshot(driver);
      if (path === "buses/218") {
        return snapshot({ busNumber: "218", route: "North", enabled: true });
      }
      if (path === "drivers") return snapshot({ "driver-1": driver });
      return snapshot(null);
    });

    await assignDriverToBus("driver-1", "218");

    const updates = writtenRecords();
    expect(updates["drivers/driver-1/assignedBus"]).toBe("218");
    expect(
      Object.keys(updates).some((path) => path.startsWith("auditLogs/")),
    ).toBe(true);
  });

  it("clears an inactive prior assignment before assigning and auditing the replacement", async () => {
    const selected = {
      displayName: "Driver One",
      enabled: true,
      assignedBus: "",
      approvalStatus: "approved",
    };
    const other = {
      displayName: "Driver Two",
      enabled: true,
      assignedBus: "218",
      approvalStatus: "approved",
    };
    firebase.get.mockImplementation(async (path: string) => {
      if (path === "drivers/driver-1") return snapshot(selected);
      if (path === "buses/218") return snapshot({ enabled: true });
      if (path === "drivers") {
        return snapshot({ "driver-1": selected, "driver-2": other });
      }
      return snapshot(null);
    });

    await assignDriverToBus("driver-1", "218");

    const updates = writtenRecords();
    expect(updates["drivers/driver-1/assignedBus"]).toBe("218");
    expect(updates["drivers/driver-2/assignedBus"]).toBe("");
    expect(
      Object.keys(updates).some((path) => path.startsWith("auditLogs/")),
    ).toBe(true);
    const writePaths = firebase.set.mock.calls.map(([reference]) => String(reference));
    expect(writePaths.indexOf("drivers/driver-2/assignedBus")).toBeLessThan(
      writePaths.indexOf("drivers/driver-1/assignedBus"),
    );
  });

  it("retires a bus through authorized paths and unassigns its inactive driver", async () => {
    const bus = {
      busNumber: "218",
      route: "North",
      enabled: true,
      lifecycleStatus: "active",
      createdAt: 100,
      updatedAt: 200,
    };
    const driver = {
      displayName: "Driver One",
      enabled: true,
      assignedBus: "218",
      approvalStatus: "approved",
    };
    firebase.get.mockImplementation(async (path: string) => {
      if (path === "buses/218") return snapshot(bus);
      if (path === "drivers") return snapshot({ "driver-1": driver });
      return snapshot(null);
    });

    await deleteFleetBus("218");

    const writes = writtenRecords();
    expect(writes["buses/218"]).toMatchObject({
      busNumber: "218",
      enabled: false,
      lifecycleStatus: "retired",
    });
    expect(writes["publicBuses/218"]).toBeNull();
    expect(writes["drivers/driver-1/assignedBus"]).toBe("");
    expect(
      Object.keys(writes).some((path) => path.startsWith("auditLogs/")),
    ).toBe(true);
    const writePaths = firebase.set.mock.calls.map(([reference]) => String(reference));
    expect(writePaths.indexOf("drivers/driver-1/assignedBus")).toBeLessThan(
      writePaths.indexOf("buses/218"),
    );
    expect(firebase.update).not.toHaveBeenCalled();
  });

  it("blocks replacement when the current bus driver is actively tracking", async () => {
    const selected = {
      displayName: "Driver One",
      enabled: true,
      assignedBus: "",
      approvalStatus: "approved",
    };
    const other = {
      displayName: "Driver Two",
      enabled: true,
      assignedBus: "218",
      approvalStatus: "approved",
    };
    firebase.get.mockImplementation(async (path: string) => {
      if (path === "drivers/driver-1") return snapshot(selected);
      if (path === "buses/218") return snapshot({ enabled: true });
      if (path === "drivers") {
        return snapshot({ "driver-1": selected, "driver-2": other });
      }
      if (path === "activeDrivers/218") return snapshot("driver-2");
      if (path === "liveBuses/218") {
        return snapshot({ active: true, driverUid: "driver-2" });
      }
      return snapshot(null);
    });

    await expect(assignDriverToBus("driver-1", "218")).rejects.toThrow(
      "Stop live tracking on Bus 218 before replacing its driver",
    );
    expect(firebase.update).not.toHaveBeenCalled();
  });

  it("requires a driver to be approved before assignment", async () => {
    const pending = {
      displayName: "Pending Driver",
      enabled: false,
      assignedBus: "",
      approvalStatus: "pending",
    };
    firebase.get.mockImplementation(async (path: string) => {
      if (path === "drivers/driver-1") return snapshot(pending);
      if (path === "buses/218") return snapshot({ enabled: true });
      return snapshot(null);
    });

    await expect(assignDriverToBus("driver-1", "218")).rejects.toThrow(
      "Approve and enable this driver",
    );
    expect(firebase.update).not.toHaveBeenCalled();
  });
});
