import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import { AdminFleetMap } from "./AdminFleetMap";
import { Badge, Empty, ErrorState, Fields, Loading, PageHeading } from "./UI";

export function AdminLiveMap({
  buses,
  drivers,
  connected,
  error,
}: {
  buses: Bus[];
  drivers: FleetDriver[];
  connected: boolean;
  error?: string;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "offline">("all");
  const [route, setRoute] = useState("");
  const [selected, setSelected] = useState(buses[0]?.id ?? "");

  const routes = useMemo(
    () => [...new Set(buses.map((bus) => bus.route))].sort(),
    [buses],
  );
  const visible = useMemo(
    () =>
      buses.filter((bus) => {
        const routeMatch = !route || bus.route === route;
        const stateMatch =
          filter === "all" ||
          (filter === "active" && bus.trackingActive) ||
          (filter === "offline" && !bus.trackingActive);
        return routeMatch && stateMatch;
      }),
    [buses, filter, route],
  );

  const current = visible.find((bus) => bus.id === selected) ?? visible[0];
  const driver = drivers.find((item) => item.assignedBus === current?.id);

  const positions = visible.map((bus) => ({
    id: bus.id,
    label: "Bus " + bus.busNumber,
    latitude: bus.latitude,
    longitude: bus.longitude,
    offline: !bus.trackingActive,
  }));

  if (error && !buses.length) return <ErrorState message={error} />;
  if (!connected && !buses.length) return <Loading text="Waiting for live fleet data…" />;

  return (
    <>
      <PageHeading
        title="Live fleet map"
        description="Monitor every registered bus, including offline buses and each bus's last known state."
      />
      <div className="filters map-filters">
        <select aria-label="Map bus filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">All buses</option>
          <option value="active">Active</option>
          <option value="offline">Offline</option>
        </select>
        <select aria-label="Filter route" value={route} onChange={(event) => setRoute(event.target.value)}>
          <option value="">All routes</option>
          {routes.map((item) => <option key={item}>{item}</option>)}
        </select>
        <span>{visible.length} buses shown</span>
      </div>

      <div className="map-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Fleet positions</h2>
            <span>{connected ? "Live GPS feed" : "Feed disconnected"}</span>
          </div>
          <AdminFleetMap positions={positions} selectedId={current?.id} onSelect={setSelected} />
        </section>

        <aside className="panel map-detail">
          <div className="panel-heading">
            <h2>Bus information</h2>
          </div>
          {current ? (
            <>
              <div className="map-info-summary">
                <strong>Bus {current.busNumber}</strong>
                <span>Route {current.route}</span>
                <span>{current.trackingActive ? "Live GPS" : "Last reported GPS"}</span>
              </div>
              <div className="map-info-status">
                <Badge value={current.trackingActive ? "online" : "offline"} />
              </div>
              <Fields
                values={[
                  ["Driver", driver?.displayName ?? "Not assigned"],
                  ["Speed", typeof current.speed === "number" ? Math.round(current.speed * 0.621371) + " mph" : "Not reported"],
                  ["Heading", typeof current.heading === "number" ? Math.round(current.heading) + "°" : "Not reported"],
                  ["GPS accuracy", current.locationAccuracyMeters !== undefined ? Math.round(current.locationAccuracyMeters) + " m" : "Not reported"],
                  ["Last update", current.lastUpdated.toLocaleString()],
                  ["Coordinates", current.trackingActive ? `${current.latitude.toFixed(5)}, ${current.longitude.toFixed(5)}` : "Last known position"],
                ]}
              />
              <Link className="primary full" to={"/"} onClick={(event) => event.preventDefault()}>
                Bus {current.busNumber} selected
              </Link>
            </>
          ) : (
            <Empty>Select a visible bus marker.</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
