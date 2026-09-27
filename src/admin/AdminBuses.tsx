import { useMemo, useState } from "react";
import { ArrowUpDown, BusFront, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import { addFleetBus, deleteFleetBus } from "../services/fleetService";
import { assignBusGeofence } from "../services/geofenceService";
import type { Geofence } from "../types/geofence";
import { Badge, Empty, ErrorState, Loading, PageHeading } from "./UI";

export function AdminBuses({
  buses,
  drivers,
  geofences,
  geofenceError,
  connected,
  error,
  onOpenBus,
}: {
  buses: Bus[];
  drivers: FleetDriver[];
  geofences: Geofence[];
  geofenceError?: string;
  connected: boolean;
  error?: string;
  onOpenBus: (busId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [sort, setSort] = useState<"fleet" | "number" | "route" | "status">("fleet");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState("");
  const [assigning, setAssigning] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busNumber, setBusNumber] = useState("");
  const [route, setRoute] = useState("");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const driverByBus = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((driver) => {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.displayName);
    });
    return map;
  }, [drivers]);

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

  const addBus = async () => {
    const normalizedBus = busNumber.trim();
    const normalizedRoute = route.trim();
    setMessage("");
    setSaveError("");

    if (!normalizedBus || !normalizedRoute) {
      setSaveError("Enter a bus number and route.");
      return;
    }

    setAdding(true);
    try {
      await addFleetBus(normalizedBus, normalizedRoute);
      setBusNumber("");
      setRoute("");
      setShowAddForm(false);
      setMessage("Bus " + normalizedBus + " added.");
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Could not add the bus.",
      );
    } finally {
      setAdding(false);
    }
  };

  const sortBy = (key: typeof sort) => {
    setSort(key);
    setAscending(sort === key ? !ascending : true);
    setPage(0);
  };

  const assignGeofence = async (bus: Bus, geofenceId: string) => {
    setAssigning(bus.id);
    setMessage("");
    setSaveError("");
    try {
      await assignBusGeofence(bus.id, geofenceId);
      const geofence = geofences.find((item) => item.id === geofenceId);
      setMessage(
        geofence
          ? `Bus ${bus.busNumber} assigned to ${geofence.name}.`
          : `Geofence assignment cleared for Bus ${bus.busNumber}.`,
      );
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not update the geofence assignment.");
    } finally {
      setAssigning("");
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
        description="Monitor every registered bus and manage geofence assignments."
      >
        <button
          className="primary"
          type="button"
          onClick={() => setShowAddForm((value) => !value)}
        >
          <Plus size={16} />
          {showAddForm ? "Close" : "Add bus"}
        </button>
      </PageHeading>

      <div className="overview-metrics">
        <div className="summary-stat"><span>Total buses</span><strong>{buses.length}</strong></div>
        <div className="summary-stat"><span><i className="status-dot green" />Online</span><strong>{online}</strong></div>
        <div className="summary-stat"><span><i className="status-dot muted" />Offline</span><strong>{buses.length - online}</strong></div>
      </div>

      {showAddForm && (
        <section className="panel buses-add-panel">
          <div className="panel-heading">
            <div>
              <h2>Add registered bus</h2>
              <span>Add a bus to the managed fleet.</span>
            </div>
          </div>
          <div className="buses-add-form">
            <input
              inputMode="numeric"
              placeholder="Bus number"
              value={busNumber}
              onChange={(event) => setBusNumber(event.target.value)}
            />
            <input
              placeholder="Route"
              value={route}
              onChange={(event) => setRoute(event.target.value)}
            />
            <button
              className="primary"
              type="button"
              disabled={adding}
              onClick={() => void addBus()}
            >
              {adding ? "Adding…" : "Add bus"}
            </button>
          </div>
        </section>
      )}

      {(message || saveError || geofenceError) && (
        <div className={saveError || geofenceError ? "error-box" : "notice"} role={saveError || geofenceError ? "alert" : "status"}>
          {saveError || geofenceError || message}
        </div>
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
                      <td>
                        <select
                          className="bus-geofence-select"
                          aria-label={`Geofence for Bus ${bus.busNumber}`}
                          value={bus.geofenceId ?? ""}
                          disabled={Boolean(assigning)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation();
                            void assignGeofence(bus, event.target.value);
                          }}
                        >
                          <option value="">No geofence</option>
                          {geofences.map((geofence) => (
                            <option key={geofence.id} value={geofence.id}>
                              {geofence.name}
                            </option>
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
