import { ChevronRight, MapPinned, Plus } from "lucide-react";
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
        <div className="geofence-list-view">
          {geofences.map((geofence) => {
            const assigned = buses.filter(
              (bus) => bus.geofenceId === geofence.id,
            ).length;

            return (
              <button
                className="geofence-list-row"
                type="button"
                key={geofence.id}
                onClick={() => onOpenGeofence(geofence.id)}
              >
                <span className="geofence-list-row-icon">
                  <MapPinned size={17} />
                </span>
                <span className="geofence-list-row-name">{geofence.name}</span>
                <span className="geofence-list-row-meta">
                  {assigned} assigned bus{assigned === 1 ? "" : "es"}
                </span>
                <span className="geofence-list-row-meta">
                  {geofence.coordinates.length} points
                </span>
                <span className="geofence-list-row-arrow" aria-hidden="true">
                  <ChevronRight size={17} />
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
