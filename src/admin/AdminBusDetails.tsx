import { useMemo } from "react";
import { ArrowLeft, Crosshair, Navigation, Smartphone } from "lucide-react";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import { Badge, Empty, ErrorState, Fields, Loading, PageHeading } from "./UI";
import { AdminFleetMap } from "./AdminFleetMap";

const STALE_MS = 60_000;

function formatAge(lastUpdated: Date) {
  const age = Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000));
  if (age < 60) return age + "s ago";
  return Math.round(age / 60) + "m ago";
}

export function AdminBusDetails({
  busId,
  buses,
  drivers,
  connected,
  error,
  onBack,
}: {
  busId: string;
  buses: Bus[];
  drivers: FleetDriver[];
  connected: boolean;
  error?: string;
  onBack: () => void;
}) {
  const bus = buses.find((item) => item.id === busId);
  const driver = drivers.find((item) => item.assignedBus === bus?.id);

  const positions = useMemo(
    () =>
      bus
        ? [{
            id: bus.id,
            label: "Bus " + bus.busNumber,
            latitude: bus.latitude,
            longitude: bus.longitude,
            offline: !bus.trackingActive,
          }]
        : [],
    [bus],
  );

  if (error && !buses.length) return <ErrorState message={error} />;
  if (!connected && !buses.length) return <Loading text="Waiting for fleet data…" />;
  if (!bus) {
    return (
      <Empty>
        Bus not found.
        <button className="text-button" type="button" onClick={onBack}>
          Return to dashboard
        </button>
      </Empty>
    );
  }

  const isFresh =
    bus.trackingActive &&
    Date.now() - bus.lastUpdated.getTime() <= STALE_MS;
  const status = isFresh ? "online" : "offline";

  return (
    <div className="bus-details-page">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={15} />
        Fleet overview
      </button>

      <PageHeading title={"Bus " + bus.busNumber} description={"Route " + bus.route}>
        <Badge value={status} />
      </PageHeading>

      <div className="bus-detail-grid admin-bus-detail-grid">
        <section className="panel bus-detail-location">
          <div className="panel-heading">
            <div>
              <h2>Live location</h2>
              <span>{isFresh ? "Live GPS" : "Last reported GPS"}</span>
            </div>
            <Navigation size={18} className="bus-detail-heading-icon" />
          </div>

          <AdminFleetMap
            positions={positions}
            selectedId={bus.id}
            animate={false}
            dataLabel={isFresh ? "LIVE GPS" : "LAST KNOWN"}
          />

          <Fields
            values={[
              ["Speed", isFresh && typeof bus.speed === "number" ? Math.round(bus.speed * 0.621371) + " mph" : "Not reported"],
              ["Heading", isFresh && typeof bus.heading === "number" ? Math.round(bus.heading) + "°" : "Not reported"],
              ["GPS accuracy", bus.locationAccuracyMeters !== undefined ? Math.round(bus.locationAccuracyMeters) + " m" : "Not reported"],
              ["Last update", bus.lastUpdated.toLocaleString()],
              ["Updated", formatAge(bus.lastUpdated)],
              ["Coordinates", bus.latitude.toFixed(5) + ", " + bus.longitude.toFixed(5)],
              ["Route", bus.route],
              ["Tracking status", isFresh ? "Tracking" : "Not currently tracking"],
            ]}
          />
        </section>

        <div className="bus-detail-side">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Device information</h2>
                <span>Current tracking device</span>
              </div>
              <Smartphone size={18} className="bus-detail-heading-icon" />
            </div>
            <Fields
              values={[
                ["Device", "Driver phone tracker"],
                ["Device status", status === "online" ? "Online" : "Offline"],
                ["GPS status", status === "online" ? "Good" : "Unavailable"],
                ["Last heartbeat", bus.lastUpdated.toLocaleString()],
                ["Battery", "Not reported"],
                ["Network", "Not reported"],
                ["App version", "Not reported"],
                ["Assigned driver", driver?.displayName ?? "Not assigned"],
              ]}
            />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Tracking summary</h2>
                <span>Current bus telemetry</span>
              </div>
              <Crosshair size={18} className="bus-detail-heading-icon" />
            </div>
            <Fields
              values={[
                ["Bus", bus.busNumber],
                ["Route", bus.route],
                ["Status", status === "online" ? "Online" : "Offline"],
                ["Driver", driver?.displayName ?? "Not assigned"],
                ["Current location", bus.currentLocation ?? (isFresh ? "Live GPS" : "Last known location")],
                ["ETA", typeof bus.etaMinutes === "number" ? bus.etaMinutes + " min" : "Not reported"],
                ["Next stop", bus.nextStop ?? "Not reported"],
                ["Delay", typeof bus.delayMinutes === "number" ? bus.delayMinutes + " min" : "Not reported"],
              ]}
            />
          </section>
        </div>
      </div>

      <section className="panel bus-detail-status-panel">
        <div className="panel-heading">
          <div>
            <h2>Tracking status</h2>
            <span>Current connection state</span>
          </div>
          <Badge value={status} />
        </div>
        <div className="bus-detail-status-content">
          <span className={"status-dot " + (status === "online" ? "green" : "muted")} />
          <div>
            <strong>{status === "online" ? "Bus is currently reporting" : "Bus is not currently reporting"}</strong>
            <p>
              {status === "online"
                ? "The tracker has reported within the last minute."
                : "The last known position is still available."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}