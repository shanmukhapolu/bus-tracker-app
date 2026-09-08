import { useSyncExternalStore } from "react";
import { busService } from "../services/busService";

export function useBuses() {
  return useSyncExternalStore(busService.subscribe, busService.getSnapshot);
}
