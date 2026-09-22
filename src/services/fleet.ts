import { getFirebaseRuntime } from "../config/firebase";

export interface BusConfig { id: string; busNumber: string; route: string; enabled: boolean; }
export interface Assignment { busId: string; assignedAt?: number; }
export interface DriverProfile { displayName?: string; email?: string; enabled?: boolean; }
export interface LiveBus { busId: string; latitude: number; longitude: number; active: boolean; lastUpdated: number; busNumber?: string; route?: string; }

export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function validCoordinate(latitude: unknown, longitude: unknown): latitude is number {
  return finite(latitude) && finite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
export function recordEntries<T>(value: unknown): [string, T][] {
  return value && typeof value === "object" ? Object.entries(value as Record<string, T>) : [];
}
export async function readAssignment(uid: string): Promise<Assignment | null> {
  const runtime = await getFirebaseRuntime(); const snap = await runtime.get(runtime.ref(runtime.db, `assignments/${uid}`));
  const value = snap.val(); return value && typeof value.busId === "string" ? value as Assignment : null;
}
export async function readBus(busId: string): Promise<BusConfig | null> {
  const runtime = await getFirebaseRuntime(); const snap = await runtime.get(runtime.ref(runtime.db, `buses/${busId}`));
  const value = snap.val(); return value && typeof value.busNumber === "string" && typeof value.route === "string" ? { id: busId, enabled: value.enabled !== false, ...value } : null;
}
