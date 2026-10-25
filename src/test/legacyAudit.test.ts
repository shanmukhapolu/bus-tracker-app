import { it, expect, vi } from "vitest";
import { auditedAdminUpdate } from "../services/adminAudit";
import type { FirebaseRuntime } from "../config/firebase";

it("writes authorized paths separately, then appends the audit record", async () => {
  const set = vi.fn().mockResolvedValue(undefined);
  const runtime = {
    auth: {
      currentUser: { uid: "synthetic-admin", email: "admin@example.test" },
    },
    db: {},
    ref: vi.fn((_db: unknown, path?: string) => path ?? "/"),
    set,
    serverTimestamp: () => ({ ".sv": "timestamp" }),
  } as unknown as FirebaseRuntime;

  await auditedAdminUpdate(runtime, "geofence_updated", "geofences/synthetic", {
    "geofences/synthetic/name": "Synthetic",
  });

  expect(set).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenNthCalledWith(1, "geofences/synthetic/name", "Synthetic");
  const [auditPath, auditRecord] = set.mock.calls[1];
  expect(String(auditPath)).toMatch(/^auditLogs\//);
  expect(auditRecord).toMatchObject({
    actorUid: "synthetic-admin",
    action: "geofence_updated",
    result: "success",
  });
  expect(runtime.ref).not.toHaveBeenCalledWith({});
});

it("reports when the change saves but its separate audit write fails", async () => {
  const set = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("audit rejected"));
  const runtime = {
    auth: { currentUser: { uid: "synthetic-admin" } },
    db: {},
    ref: vi.fn((_db: unknown, path?: string) => path ?? "/"),
    set,
    serverTimestamp: () => 1,
  } as unknown as FirebaseRuntime;

  await expect(
    auditedAdminUpdate(runtime, "driver_disabled", "drivers/synthetic", {
      "drivers/synthetic/enabled": false,
    }),
  ).rejects.toThrow(
    "The admin change was saved, but its audit record could not be saved. Refresh the page and verify the change. Firebase reported: audit rejected",
  );
  expect(set).toHaveBeenCalledTimes(2);
});
