import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_db: unknown, path: string) => path),
  runTransaction: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));

vi.mock("../config/firebase", () => ({
  getFirebaseRuntime: async () => ({
    db: {},
    auth: {},
    ref: firebase.ref,
    runTransaction: firebase.runTransaction,
    createUserWithEmailAndPassword: firebase.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: firebase.signInWithEmailAndPassword,
  }),
}));

import { ensureDriverProfile, signUpDriver } from "./driverAuthService";

describe("driver approval registration", () => {
  beforeEach(() => {
    firebase.ref.mockClear();
    firebase.runTransaction.mockReset();
    firebase.createUserWithEmailAndPassword.mockReset();
    firebase.signInWithEmailAndPassword.mockReset();
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

  it("recovers an existing authentication account and creates its missing pending profile", async () => {
    const user = {
      uid: "driver-jack",
      displayName: null,
      email: "jack@example.test",
    };
    firebase.createUserWithEmailAndPassword.mockRejectedValue({
      code: "auth/email-already-in-use",
    });
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user });
    firebase.runTransaction.mockImplementation(
      async (_reference: unknown, update: (current: unknown) => unknown) => {
        const value = update(null);
        return { snapshot: { val: () => value } };
      },
    );

    const result = await signUpDriver(
      "Jack Driver",
      "jack@example.test",
      "correct-password",
    );

    expect(firebase.signInWithEmailAndPassword).toHaveBeenCalledWith(
      {},
      "jack@example.test",
      "correct-password",
    );
    expect(result.recoveredExistingAccount).toBe(true);
    expect(result.profile).toEqual({
      displayName: "Jack Driver",
      email: "jack@example.test",
      enabled: false,
      assignedBus: "",
      approvalStatus: "pending",
    });
  });

  it("explains how to continue when an existing account uses another password or Google", async () => {
    firebase.createUserWithEmailAndPassword.mockRejectedValue({
      code: "auth/email-already-in-use",
    });
    firebase.signInWithEmailAndPassword.mockRejectedValue({
      code: "auth/invalid-credential",
    });

    await expect(
      signUpDriver("Jack Driver", "jack@example.test", "wrong-password"),
    ).rejects.toThrow(
      "This email already has an account, but that password did not match. Use Log in with the existing password or Continue with Google.",
    );
  });
});
