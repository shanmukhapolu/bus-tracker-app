import { useMemo, useState } from "react";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import { Badge, Empty, ErrorState, Loading, Metric, PageHeading } from "./UI";

export function AdminDevices({
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
  const [filter, setFilter] = useState("all");

  const records = useMemo(
    () =>
      buses.map((bus) => ({
        bus,
        driver: drivers.find((item) => item.assignedBus === bus.id)?.displayName ?? "Not assigned",
      })),
    [buses, drivers],
  );

  const shown = records.filter(({ bus }) =>
    filter === "all" ||
    (filter === "problems" && !bus.trackingActive) ||
    filter === (bus.trackingActive ? "online" : "offline"),
  );

  if (error && !buses.length) return <ErrorState message={error} />;
  if (!connected && !buses.length) return <Loading text="Waiting for device data…" />;

  return (
    <>
      <PageHeading
        title="Tracking devices"
        description="Monitor the driver phone tracker associated with each registered bus."
      />
      <div className="metrics">
        <Metric label="Registered devices" value={records.length} />
        <Metric label="Healthy" value={records.filter(({ bus }) => bus.trackingActive).length} tone="green" />
        <Metric label="Require attention" value={records.filter(({ bus }) => !bus.trackingActive).length} tone="amber" />
        <Metric label="Offline" value={records.filter(({ bus }) => !bus.trackingActive).length} />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Device health</h2>
          <select aria-label="Device status" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="problems">Problems</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        {shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {["Bus","Device","Status","GPS","Speed","Accuracy","Last update","Driver"].map((label) => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ bus, driver }) => (
                  <tr key={bus.id}>
                    <td><strong>Bus {bus.busNumber}</strong></td>
                    <td>Driver phone tracker</td>
                    <td><Badge value={bus.trackingActive ? "online" : "offline"} /></td>
                    <td><Badge value={bus.trackingActive ? "good" : "unavailable"} /></td>
                    <td>{typeof bus.speed === "number" ? Math.round(bus.speed * 0.621371) + " mph" : "Not reported"}</td>
                    <td>{bus.locationAccuracyMeters !== undefined ? Math.round(bus.locationAccuracyMeters) + " m" : "Not reported"}</td>
                    <td>{bus.trackingActive ? bus.lastUpdated.toLocaleString() : "Not reporting"}</td>
                    <td>{driver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No devices match this status.</Empty>
        )}
      </section>
    </>
  );
}
