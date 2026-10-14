import { it, expect, vi } from "vitest";
import { auditedAdminUpdate } from "../services/adminAudit";
import type { FirebaseRuntime } from "../config/firebase";
it("sends the legacy mutation and required audit in one update", async () => {
  const update = vi.fn().mockResolvedValue(undefined);
  const runtime = {
    auth: {
      currentUser: { uid: "synthetic-admin", email: "admin@example.test" },
    },
    db: {},
    ref: vi.fn(() => "root"),
    update,
    serverTimestamp: () => ({ ".sv": "timestamp" }),
  } as unknown as FirebaseRuntime;
  await auditedAdminUpdate(runtime, "geofence_updated", "geofences/synthetic", {
    "geofences/synthetic/name": "Synthetic",
  });
  expect(update).toHaveBeenCalledTimes(1);
  const changes = update.mock.calls[0][1];
  expect(changes["geofences/synthetic/name"]).toBe("Synthetic");
  expect(
    Object.entries(changes).find(([key]) => key.startsWith("auditLogs/"))?.[1],
  ).toMatchObject({
    actorUid: "synthetic-admin",
    action: "geofence_updated",
    result: "success",
  });
});
it("propagates a rejected atomic commit without reporting legacy success", async () => {
  const update = vi.fn().mockRejectedValue(new Error("audit rejected"));
  const runtime = {
    auth: { currentUser: { uid: "synthetic-admin" } },
    db: {},
    ref: () => "root",
    update,
    serverTimestamp: () => 1,
  } as unknown as FirebaseRuntime;
  await expect(
    auditedAdminUpdate(runtime, "driver_disabled", "drivers/synthetic", {
      "drivers/synthetic/enabled": false,
    }),
  ).rejects.toThrow("audit rejected");
  expect(update).toHaveBeenCalledTimes(1);
});
