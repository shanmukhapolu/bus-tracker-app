import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import type { Bus } from "../types/bus";
import type { Geofence } from "../services/geofenceService";

function isInside(latitude: number, longitude: number, points: Geofence["points"]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].longitude;
    const yi = points[i].latitude;
    const xj = points[j].longitude;
    const yj = points[j].latitude;
    const intersects =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface GeofenceAlert {
  id: string;
  busNumber: string;
  geofenceName: string;
  timestamp: number;
}

export function AdminGeofenceMonitor({
  buses,
  geofences,
  onEnter,
}: {
  buses: Bus[];
  geofences: Geofence[];
  onEnter: (alert: GeofenceAlert) => void;
}) {
  const previous = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    const activeGeofences = new Map(geofences.filter((item) => item.enabled).map((item) => [item.id, item]));

    buses.forEach((bus) => {
      if (!bus.trackingActive || !bus.geofenceId) return;
      const geofence = activeGeofences.get(bus.geofenceId);
      if (!geofence || geofence.points.length < 3) return;

      const key = `${bus.id}:${geofence.id}`;
      const inside = isInside(bus.latitude, bus.longitude, geofence.points);
      const hadPrevious = previous.current.has(key);
      const wasInside = previous.current.get(key);

      if (hadPrevious && wasInside === false && inside) {
        onEnter({
          id: `${key}:${Date.now()}`,
          busNumber: bus.busNumber,
          geofenceName: geofence.name,
          timestamp: Date.now(),
        });
      }

      previous.current.set(key, inside);
    });

    const validKeys = new Set(
      buses.flatMap((bus) => (bus.geofenceId ? [`${bus.id}:${bus.geofenceId}`] : [])),
    );
    previous.current.forEach((_value, key) => {
      if (!validKeys.has(key)) previous.current.delete(key);
    });
  }, [buses, geofences, onEnter]);

  return null;
}

export function GeofenceToast({
  alert,
  onDismiss,
}: {
  alert: GeofenceAlert;
  onDismiss: () => void;
}) {
  return (
    <div className="geofence-toast" role="status" aria-live="polite">
      <div className="geofence-toast-icon"><MapPin size={18} /></div>
      <div>
        <strong>Geofence entry</strong>
        <p>Bus {alert.busNumber} entered {alert.geofenceName}.</p>
        <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>
    </div>
  );
}
