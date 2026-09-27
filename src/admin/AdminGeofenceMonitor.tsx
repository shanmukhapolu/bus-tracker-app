import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import type { Bus } from "../types/bus";
import type { Geofence } from "../types/geofence";

interface Props {
  buses: Bus[];
  geofences: Geofence[];
}

interface Toast {
  id: string;
  busId: string;
  busNumber: string;
  geofenceName: string;
  createdAt: number;
}

export function pointInPolygon(
  point: [number, number],
  polygon: [number, number][],
) {
  if (polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function AdminGeofenceMonitor({ buses, geofences }: Props) {
  const previousInside = useRef(new Map<string, boolean>());
  const lastAlertAt = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const geofenceById = new Map(geofences.map((geofence) => [geofence.id, geofence]));
    const nextKeys = new Set<string>();
    const now = Date.now();

    for (const bus of buses) {
      const geofenceId = bus.geofenceId?.trim();
      if (!geofenceId || !bus.trackingActive) continue;
      const geofence = geofenceById.get(geofenceId);
      if (!geofence) continue;

      const key = bus.id + ":" + geofence.id;
      nextKeys.add(key);
      const inside = pointInPolygon([bus.longitude, bus.latitude], geofence.coordinates);
      const previous = previousInside.current.get(key);
      const lastAlert = lastAlertAt.current.get(key) ?? 0;

      if (previous === false && inside && now - lastAlert >= 30000) {
        const toast: Toast = {
          id: key + ":" + now,
          busId: bus.id,
          busNumber: bus.busNumber,
          geofenceName: geofence.name,
          createdAt: now,
        };
        setToasts((current) => [...current, toast].slice(-4));
        lastAlertAt.current.set(key, now);
      }
      previousInside.current.set(key, inside);
    }

    previousInside.current.forEach((_value, key) => {
      if (!nextKeys.has(key)) previousInside.current.delete(key);
    });
  }, [buses, geofences]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 9000;
      setToasts((current) => current.filter((toast) => toast.createdAt > cutoff));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [toasts.length]);

  const dismiss = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));

  if (!toasts.length) return null;

  return (
    <div className="geofence-toast-stack" aria-live="assertive" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className="geofence-toast-shell">
          <div className="geofence-toast">
            <div className="geofence-toast-icon"><BellRing size={16} /></div>
            <div className="geofence-toast-copy">
              <strong>Geofence entry</strong>
              <p>Bus {toast.busNumber} entered <b>{toast.geofenceName}</b>.</p>
              <span>{new Date(toast.createdAt).toLocaleTimeString()}</span>
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}