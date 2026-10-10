import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_db: unknown, path: string) => path),
  runTransaction: vi.fn(),
}));

vi.mock("../config/firebase", () => ({
  getFirebaseRuntime: async () => ({
    db: {},
    ref: firebase.ref,
    runTransaction: firebase.runTransaction,
  }),
}));

import { ensureDriverProfile } from "./driverAuthService";

describe("driver approval registration", () => {
  beforeEach(() => {
    firebase.ref.mockClear();
    firebase.runTransaction.mockReset();
  });

  it("creates a pending profile the first time an authenticated driver signs in", async () => {
    firebase.runTransaction.mockImplementation(
      async (_reference: unknown, update: (current: unknown) => unknown) => {
        const value = update(null);
        return { snapshot: { val: () => value } };
      },
    );

    const profile = await ensureDriverProfile({
      uid: "driver-google-uid",
      displayName: "Jamie Driver",
      email: "jamie@example.test",
    });

    expect(firebase.ref).toHaveBeenCalledWith({}, "drivers/driver-google-uid");
    expect(profile).toEqual({
      displayName: "Jamie Driver",
      email: "jamie@example.test",
      enabled: false,
      assignedBus: "",
      approvalStatus: "pending",
    });
  });

  it("does not overwrite an existing approved driver profile", async () => {
    const approved = {
      displayName: "Existing Driver",
      enabled: true,
      assignedBus: "45",
      approvalStatus: "approved",
    };
    firebase.runTransaction.mockImplementation(
      async (_reference: unknown, update: (current: unknown) => unknown) => {
        const value = update(approved);
        return { snapshot: { val: () => value } };
      },
    );

    await expect(
      ensureDriverProfile({
        uid: "driver-existing",
        email: "new@example.test",
      }),
    ).resolves.toEqual(approved);
  });
});
