import { it, expect, vi } from "vitest";
const runtime = vi.hoisted(() => vi.fn());
vi.mock("../config/firebase", () => ({ getFirebaseRuntime: runtime }));
import { addFleetBus } from "../services/fleetService";
it("rejects legacy bus registration before any Firebase access", async () => {
  await expect(addFleetBus("SYN-101", "Unassigned")).rejects.toThrow(
    "official Transportation admin",
  );
  expect(runtime).not.toHaveBeenCalled();
});
