import type { Bus, BusSnapshot } from "../types/bus";
import { firebaseConfig, firebaseConfigured } from "../config/firebase";
import { finite, recordEntries, validCoordinate } from "./fleet";
import type { BusService } from "./busService";

const INTERVAL = 5_000;
type PublicBus = { busNumber?: unknown; route?: unknown; enabled?: unknown };
type Live = { latitude?: unknown; longitude?: unknown; active?: unknown; lastUpdated?: unknown; speedMps?: unknown; headingDeg?: unknown; accuracyMeters?: unknown };
function url() { return firebaseConfig.databaseURL!.replace(/\/+$/, ""); }
function parse(data: unknown): Bus[] {
 const root = data && typeof data === "object" ? data as { publicBuses?: unknown; publicLiveBuses?: unknown } : {};
 const live = root.publicLiveBuses && typeof root.publicLiveBuses === "object" ? root.publicLiveBuses as Record<string, Live> : {};
 return recordEntries<PublicBus>(root.publicBuses).map(([id, config]) => {
   const point = live[id]; const coordinates = validCoordinate(point?.latitude, point?.longitude);
   const active = config.enabled !== false && point?.active === true && coordinates;
   const timestamp = finite(point?.lastUpdated) ? point.lastUpdated : Date.now();
   const age = Date.now() - timestamp;
   return { id, busNumber: typeof config.busNumber === "string" ? config.busNumber : id, route: typeof config.route === "string" ? config.route : "Route unavailable", latitude: coordinates ? point.latitude as number : 0, longitude: coordinates ? point.longitude as number : 0, trackingActive: active && age <= 300_000, status: "offline", currentLocation: active ? (age > 60_000 ? "Location is stale" : "Live GPS") : "Not tracking", lastUpdated: new Date(timestamp), speed: finite(point?.speedMps) ? point.speedMps * 3.6 : undefined, heading: finite(point?.headingDeg) ? point.headingDeg : undefined, locationAccuracyMeters: finite(point?.accuracyMeters) ? point.accuracyMeters : undefined };
 });
}
export function createFirebaseBusService(): BusService {
 let snapshot: BusSnapshot = { buses: [], mode: "live", connected: false, updateIntervalMs: INTERVAL }; const listeners = new Set<() => void>(); let timer: ReturnType<typeof setInterval> | undefined; let busy=false;
 const notify=()=>listeners.forEach((f)=>f());
 const refresh=async()=>{ if(busy)return; busy=true; try { const [busesResponse, liveResponse] = await Promise.all([fetch(`${url()}/publicBuses.json`, {cache:"no-store"}), fetch(`${url()}/publicLiveBuses.json`, {cache:"no-store"})]); if(!busesResponse.ok || !liveResponse.ok) throw new Error(`Firebase returned HTTP ${!busesResponse.ok ? busesResponse.status : liveResponse.status}.`); snapshot={...snapshot,buses:parse({publicBuses: await busesResponse.json(), publicLiveBuses: await liveResponse.json()}),connected:true,connectionError:undefined,lastSyncAt:new Date()}; } catch(e) { snapshot={...snapshot,connected:false,connectionError:e instanceof Error?e.message:"Could not read public live bus data."}; } finally {busy=false;notify();} };
 return {getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener); if(!timer){void refresh();timer=setInterval(()=>void refresh(),INTERVAL);} return()=>{listeners.delete(listener);if(!listeners.size&&timer){clearInterval(timer);timer=undefined;}};}};
}
export const firebaseBusService=firebaseConfigured?createFirebaseBusService():null;
