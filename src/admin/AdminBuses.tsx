import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import type { Bus } from "../types/bus";
import type { FleetDriver } from "../services/fleetService";
import { addFleetBus, assignDriverToBus, deleteFleetBus } from "../services/fleetService";
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
  const [addingBus, setAddingBus] = useState(false);
  const [newBusNumber, setNewBusNumber] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [newGeofenceId, setNewGeofenceId] = useState("");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const driverByBus = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((driver) => {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.displayName);
    });
    return map;
  }, [drivers]);

  const driverUidByBus = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((driver) => {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.uid);
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

  const sortBy = (key: typeof sort) => {
    setSort(key);
    setAscending(sort === key ? !ascending : true);
    setPage(0);
  };

  const createBus = async () => {
    setAddingBus(true);
    setMessage("");
    setSaveError("");
    try {
      const bus = await addFleetBus(newBusNumber, newRoute, newGeofenceId);
      setMessage(`Bus ${bus.busNumber} created.`);
      setNewBusNumber("");
      setNewRoute("");
      setNewGeofenceId("");
      setPage(0);
      setQuery("");
      setFilter("all");
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not create the bus.");
    } finally {
      setAddingBus(false);
    }
  };

  const assignDriver = async (bus: Bus, selectedUid: string) => {
    const currentUid = driverUidByBus.get(bus.id) ?? "";
    if (selectedUid === currentUid) return;

    const targetUid = selectedUid || currentUid;
    if (!targetUid) return;

    setAssigning(bus.id);
    setMessage("");
    setSaveError("");
    try {
      await assignDriverToBus(targetUid, selectedUid ? bus.id : "");
      const driver = drivers.find((candidate) => candidate.uid === targetUid);
      setMessage(
        selectedUid
          ? `Assigned ${driver?.displayName ?? "driver"} to Bus ${bus.busNumber}.`
          : `Unassigned ${driver?.displayName ?? "driver"} from Bus ${bus.busNumber}.`,
      );
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not update the driver assignment.");
    } finally {
      setAssigning("");
    }
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
        description="Create buses, assign approved drivers, and manage geofence assignments."
      />

      <section className="panel bus-create-panel">
        <div>
          <h2>Add a bus</h2>
          <p>Create a fleet record that is immediately available for driver assignment.</p>
        </div>
        <form
          className="bus-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createBus();
          }}
        >
          <label>
            Bus number
            <input
              aria-label="New bus number"
              name="newBusNumber"
              autoComplete="off"
              required
              maxLength={20}
              value={newBusNumber}
              disabled={addingBus}
              onChange={(event) => setNewBusNumber(event.target.value)}
              placeholder="e.g. 218"
            />
          </label>
          <label>
            Route
            <input
              aria-label="New bus route"
              name="newBusRoute"
              autoComplete="off"
              required
              maxLength={100}
              value={newRoute}
              disabled={addingBus}
              onChange={(event) => setNewRoute(event.target.value)}
              placeholder="e.g. North"
            />
          </label>
          <label>
            Geofence (optional)
            <select
              aria-label="Geofence for new bus"
              value={newGeofenceId}
              disabled={addingBus}
              onChange={(event) => setNewGeofenceId(event.target.value)}
            >
              <option value="">No geofence</option>
              {geofences.map((geofence) => (
                <option key={geofence.id} value={geofence.id}>{geofence.name}</option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit" disabled={addingBus || !newBusNumber.trim() || !newRoute.trim()}>
            <Plus size={16} /> {addingBus ? "Creating…" : "Create bus"}
          </button>
        </form>
      </section>

      <div className="overview-metrics">
        <div className="summary-stat"><span>Total buses</span><strong>{buses.length}</strong></div>
        <div className="summary-stat"><span><i className="status-dot green" />Online</span><strong>{online}</strong></div>
        <div className="summary-stat"><span><i className="status-dot muted" />Offline</span><strong>{buses.length - online}</strong></div>
      </div>

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
                          Bus {bus.busNumber}
                        </button>
                      </td>
                      <td>{bus.route}</td>
                      <td><Badge value={bus.trackingActive ? "online" : "offline"} /></td>
                      <td>
                        <select
                          className="bus-driver-select"
                          aria-label={`Driver for Bus ${bus.busNumber}`}
                          value={driverUidByBus.get(bus.id) ?? ""}
                          disabled={Boolean(assigning)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation();
                            void assignDriver(bus, event.target.value);
                          }}
                        >
                          <option value="">Not assigned</option>
                          {drivers.map((driver) => {
                            const currentUid = driverUidByBus.get(bus.id) ?? "";
                            const assignedElsewhere = Boolean(driver.assignedBus && driver.assignedBus !== bus.id);
                            const disabled = !driver.enabled || assignedElsewhere;
                            return (
                              <option
                                key={driver.uid}
                                value={driver.uid}
                                disabled={disabled && driver.uid !== currentUid}
                              >
                                {driver.displayName}{driver.enabled ? "" : " (not approved)"}{assignedElsewhere ? " (assigned elsewhere)" : ""}
                              </option>
                            );
                          })}
                        </select>
                        {driverByBus.get(bus.id) && (
                          <span className="sr-only">Assigned to {driverByBus.get(bus.id)}</span>
                        )}
                      </td>
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
