import { MapPinned, Plus } from "lucide-react";
import type { Bus } from "../types/bus";
import type { Geofence } from "../types/geofence";
import { Empty, PageHeading } from "./UI";

export function AdminGeofences({
  geofences,
  buses,
  onOpenGeofence,
}: {
  geofences: Geofence[];
  buses: Bus[];
  onOpenGeofence: (id: string) => void;
}) {
  return (
    <div className="geofences-page">
      <PageHeading
        title="Geofences"
        description="Manage monitored areas and open any zone to review its buses, alerts, and entry order."
      >
        <button
          className="primary"
          type="button"
          onClick={() => onOpenGeofence("new")}
        >
          <Plus size={16} />
          Add geofence
        </button>
      </PageHeading>

      {geofences.length ? (
        <div className="geofence-card-grid">
          {geofences.map((geofence) => {
            const assigned = buses.filter(
              (bus) => bus.geofenceId === geofence.id,
            ).length;

            return (
              <button
                className="geofence-card"
                type="button"
                key={geofence.id}
                onClick={() => onOpenGeofence(geofence.id)}
              >
                <span className="geofence-card-icon">
                  <MapPinned size={19} />
                </span>
                <span className="geofence-card-copy">
                  <strong>{geofence.name}</strong>
                  <span>
                    {assigned} assigned bus{assigned === 1 ? "" : "es"}
                  </span>
                  <small>{geofence.coordinates.length} polygon points</small>
                </span>
                <span className="geofence-card-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="panel geofence-empty-panel">
          <Empty>
            No geofences have been created yet. Add one to start monitoring a zone.
          </Empty>
        </section>
      )}
    </div>
  );
}
