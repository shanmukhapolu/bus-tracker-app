import type { Bus, Coordinate } from "../types/bus";

export function filterBuses(buses: Bus[], query: string) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return buses.filter((bus) => {
    const searchable = `bus ${bus.busNumber} route ${bus.route}`.toLowerCase();
    return tokens.every((token) => searchable.includes(token));
  });
}

export function statusLabel(bus: Bus) {
  if (bus.status === "offline") return "Offline";
  if (bus.status === "late")
    return bus.delayMinutes ? `${bus.delayMinutes} min late` : "Delayed";
  return "On time";
}

export function updatedLabel(updated: Date, now: number) {
  const seconds = Math.max(0, Math.floor((now - updated.getTime()) / 1000));
  if (seconds < 1) return "Just now";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

export function interpolatePosition(
  from: Coordinate,
  to: Coordinate,
  progress: number,
): Coordinate {
  const t = Math.max(0, Math.min(1, progress));
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}
