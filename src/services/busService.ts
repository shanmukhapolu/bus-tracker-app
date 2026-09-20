import type { BusSnapshot } from "../types/bus";
import { mockBusService } from "./mockBusService";
import { firebaseBusService } from "./firebaseBusService";

export interface BusService {
  getSnapshot(): BusSnapshot;
  subscribe(listener: () => void): () => void;
}

export const busService: BusService =
  firebaseBusService ?? mockBusService;
