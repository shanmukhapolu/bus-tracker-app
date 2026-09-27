import { useMemo, useState } from "react";
import { ArrowUpDown, BusFront, ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import type { Geofence } from "../services/geofenceService";
import { assignGeofenceToBus } from "../services/geofenceService";
import { deleteFleetBus } from "../services/fleetService";
import { Badge, Empty, ErrorState, Loading, PageHeading } from "./UI";

export function AdminBuses({
  buses,
  drivers,
  geofences,
  connected,
  error,
  onOpenBus,
}: {
  buses: Bus[];
  drivers: FleetDriver[];
  geofences: Geofence[];
  connected: boolean;
  error?: string;
  onOpenBus: (busId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [sort, setSort] = useState<"fleet" | "number" | "route" | "status">("fleet");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [savingBus, setSavingBus] = useState("");
  const [deleting, setDeleting] = useState("");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const driverByBus = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((driver) => {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.displayName);
    });
    return map;
  }, [drivers]);

  const geofenceById = useMemo(
    () => new Map(geofences.map((geofence) => [geofence.id, geofence])),
    [geofences],
  );

  const rows = useMemo(() => {
    const result = buses.filter((bus) => {
      const matchesQuery = (bus.busNumber + " " + bus.route).toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "online" && bus.trackingActive) ||
        (filter === "offline" && !bus.trackingActive);
      return matchesQuery && matchesFilter;
    });

    if (sort !== "fleet") {
      result.sort((a, b) => {
        const key = sort === "number" ? "busNumber" : sort === "route" ? "route" : "status";
        return String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) * (ascending ? 1 : -1);
      });
    }
    return result;
  }, [buses, query, filter, sort, ascending]);

  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = rows.slice(currentPage * 8, currentPage * 8 + 8);
  const online = buses.filter((bus) => bus.trackingActive).length;

  const sortBy = (key: typeof sort) => {
    setSort(key);
    setAscending(sort === key ? !ascending : true);
    setPage(0);
  };

  const updateGeofence = async (bus: Bus, geofenceId: string) => {
    setSavingBus(bus.id);
    setMessage("");
    setSaveError("");
    try {
      await assignGeofenceToBus(bus.id, geofenceId);
      setMessage(geofenceId ? `Bus ${bus.busNumber} assigned to ${geofenceById.get(geofenceId)?.name ?? "geofence"}.` : `Geofence removed from Bus ${bus.busNumber}.`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not update the bus geofence.");
    } finally {
      setSavingBus("");
    }
  };

  const removeBus = async (bus: Bus) => {
    if (!window.confirm(`Delete Bus ${bus.busNumber}? Any assigned driver will be unassigned.`)) return;
    setDeleting(bus.id);
    try {
      await deleteFleetBus(bus.busNumber);
      setMessage(`Bus ${bus.busNumber} deleted.`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not delete the bus.");
    } finally {
      setDeleting("");
    }
  };

  if (error && !buses.length) return <ErrorState message={error} />;
  if (!connected && !buses.length) return <Loading text="Waiting for live fleet data…" />;

  return (
    <div className="buses-page">
      <PageHeading
        title="Buses"
        description="Monitor every registered bus, open its live details, and assign the geofence it should trigger."
      />

      <div className="overview-metrics">
        <div className="summary-stat"><span>Total buses</span><strong>{buses.length}</strong></div>
        <div className="summary-stat"><span><i className="status-dot green" />Online</span><strong>{online}</strong></div>
        <div className="summary-stat"><span><i className="status-dot muted" />Offline</span><strong>{buses.length - online}</strong></div>
        <div className="summary-stat"><span><i className="status-dot blue" />Geofenced</span><strong>{buses.filter((bus) => bus.geofenceId && geofenceById.has(bus.geofenceId)).length}</strong></div>
      </div>

      {(message || saveError) && (
        <div className={saveError ? "error-box" : "notice"} role={saveError ? "alert" : "status"}>{saveError || message}</div>
      )}

      <section className="panel buses-panel">
        <div className="panel-heading">
          <div>
            <h2>Fleet</h2>
            <span>{rows.length} matching bus{rows.length === 1 ? "" : "es"}</span>
          </div>
          <label className="search buses-search">
            <Search size={15} />
            <input
              aria-label="Search buses"
              placeholder="Search bus or route…"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            />
          </label>
        </div>

        <div className="fleet-tabs" role="group" aria-label="Fleet status filter">
          {([
            ["all", "All", buses.length],
            ["online", "Online", online],
            ["offline", "Offline", buses.length - online],
          ] as const).map(([value, label, count]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>
              <span>{label}</span><span className="tab-count">{count}</span>
            </button>
          ))}
        </div>

        {visibleRows.length ? (
          <div className="table-wrap buses-table-wrap">
            <table className="fleet-table buses-table">
              <thead>
                <tr>
                  {([
                    ["number", "Bus"],
                    ["route", "Route"],
                    ["status", "Status"],
                  ] as const).map(([key, label]) => (
                    <th key={key}>
                      <button className="sort-button" type="button" onClick={() => sortBy(key)}>
                        {label}<ArrowUpDown size={11} />
                      </button>
                    </th>
                  ))}
                  <th>Driver</th>
                  <th>Geofence</th>
                  <th>Last update</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((bus) => {
                  const geofence = bus.geofenceId ? geofenceById.get(bus.geofenceId) : undefined;
                  return (
                    <tr key={bus.id} onClick={() => onOpenBus(bus.id)} className="bus-click-row">
                      <td>
                        <button className="bus-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenBus(bus.id); }}>
                          <BusFront size={19} strokeWidth={1.8} /> Bus {bus.busNumber}
                        </button>
                      </td>
                      <td>{bus.route}</td>
                      <td><Badge value={bus.trackingActive ? "online" : "offline"} /></td>
                      <td>{driverByBus.get(bus.id) ?? "Not assigned"}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <select
                          className="bus-geofence-select"
                          value={bus.geofenceId ?? ""}
                          disabled={savingBus === bus.id}
                          onChange={(event) => void updateGeofence(bus, event.target.value)}
                          aria-label={`Geofence for Bus ${bus.busNumber}`}
                        >
                          <option value="">No geofence</option>
                          {geofences.filter((item) => item.enabled).map((geofence) => (
                            <option key={geofence.id} value={geofence.id}>{geofence.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>{bus.trackingActive ? bus.lastUpdated.toLocaleTimeString() : "Not reporting"}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <button className="secondary admin-table-action admin-delete" type="button" disabled={Boolean(deleting)} onClick={() => void removeBus(bus)}>
                          <Trash2 size={14} /> {deleting === bus.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No buses match the current filters.</Empty>
        )}

        <div className="table-footer">
          <span>{rows.length ? `Showing ${currentPage * 8 + 1}–${Math.min((currentPage + 1) * 8, rows.length)} of ${rows.length} buses` : "0 buses"}</span>
          <nav className="pagination" aria-label="Bus pages">
            <button aria-label="Previous bus page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
            {Array.from({ length: pages }, (_, index) => (
              <button key={index} aria-label={`Bus page ${index + 1}`} aria-current={currentPage === index ? "page" : undefined} onClick={() => setPage(index)}>{index + 1}</button>
            ))}
            <button aria-label="Next bus page" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
          </nav>
        </div>
      </section>
    </div>
  );
}
