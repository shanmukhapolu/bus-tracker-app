import type { BusSnapshot } from "../types/bus";
import { mockBusService } from "./mockBusService";

export interface BusService {
  getSnapshot(): BusSnapshot;
  subscribe(listener: () => void): () => void;
}

// This is the only composition point to change when Firebase is introduced.
// A future adapter normalizes Firebase records into BusSnapshot and owns cleanup.
export const busService: BusService = mockBusService;
