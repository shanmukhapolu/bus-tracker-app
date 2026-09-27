import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowRight, BusFront, ChevronLeft, ChevronRight, Map as MapIcon, Search, Trash2 } from "lucide-react";
import type { Bus } from "../types/bus";
import { deleteFleetBus } from "../services/fleetService";
import { AdminFleetMap } from "./AdminFleetMap";
import { Empty, ErrorState, Loading, PageHeading } from "./UI";
import type { FleetDriver } from "../services/fleetService";

export function AdminDashboard({
  buses,
  drivers,
  connected,
  error,
  onRefreshHint,
  onOpenBus,
}: {
  buses: Bus[];
  drivers: FleetDriver[];
  connected: boolean;
  error?: string;
  onRefreshHint?: () => void;
  onOpenBus?: (busId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [sort, setSort] = useState<"fleet" | "number" | "route" | "status">("fleet");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(buses[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState("");

  const driverByBus = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.displayName);
    }
    return map;
  }, [drivers]);

  const rows = useMemo(() => {
    const result = buses.filter((bus) => {
      const matchesQuery = (bus.busNumber + " " + bus.route)
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "online" && bus.trackingActive) ||
        (filter === "offline" && !bus.trackingActive);
      return matchesQuery && matchesFilter;
    });
    if (sort !== "fleet") {
      result.sort((a, b) => {
        const key =
          sort === "number"
            ? "busNumber"
            : sort === "route"
              ? "route"
              : "status";
        return String(a[key]).localeCompare(String(b[key]), undefined, {
          numeric: true,
        }) * (ascending ? 1 : -1);
      });
    }
    return result;
  }, [buses, query, filter, sort, ascending]);

  const online = buses.filter((bus) => bus.trackingActive).length;
  const offline = buses.length - online;
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = rows.slice(currentPage * 8, currentPage * 8 + 8);

  const sortBy = (key: typeof sort) => {
    setSort(key);
    setAscending(sort === key ? !ascending : true);
    setPage(0);
  };

  const selectBus = (id: string) => {
    setSelected(id);
    const index = rows.findIndex((bus) => bus.id === id);
    if (index >= 0) setPage(Math.floor(index / 8));
  };

  const removeBus = async (bus: Bus) => {
    if (!window.confirm(`Delete Bus ${bus.busNumber}? Any assigned driver will be unassigned.`)) return;
    setDeleting(bus.id);
    setSaveError("");
    setMessage("");
    try {
      await deleteFleetBus(bus.busNumber);
      setMessage(`Bus ${bus.busNumber} deleted.`);
      if (selected === bus.id) setSelected("");
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not delete the bus.");
    } finally {
      setDeleting("");
      onRefreshHint?.();
    }
  };

  if (error && !buses.length) return <ErrorState message={error} />;
  if (!connected && !buses.length) return <Loading text="Waiting for live fleet data…" />;

  const current = buses.find((bus) => bus.id === selected) ?? buses[0];
  const positions = buses.map((bus) => ({
    id: bus.id,
    label: "Bus " + bus.busNumber,
    latitude: bus.latitude,
    longitude: bus.longitude,
    offline: !bus.trackingActive,
  }));

  return (
    <div className="overview-workspace">
      <PageHeading title="Fleet overview" description="Monitor fleet activity and manage the registered bus fleet.">
        <div className="admin-actions">
          <button className="secondary overview-map-link" type="button" onClick={() => onRefreshHint?.()}>
            <MapIcon size={16} />
            Live feed
          </button>
        </div>
      </PageHeading>

      <div className="overview-metrics" aria-label="Fleet summary">
        <div className="summary-stat"><span>Total buses</span><strong>{buses.length}</strong></div>
        <div className="summary-stat"><span><i className="status-dot green" />Online</span><strong>{online}</strong></div>
        <div className="summary-stat"><span><i className="status-dot muted" />Offline</span><strong>{offline}</strong></div>
      </div>

      {(message || saveError) && (
        <div className={saveError ? "error-box" : "notice"} role={saveError ? "alert" : "status"}>
          {saveError || message}
        </div>
      )}

      <div className="overview-grid">
        <section className="panel fleet-panel" aria-labelledby="fleet-status-heading">
          <div className="panel-heading">
            <div>
              <h2 id="fleet-status-heading">Fleet status</h2>
              <span>{buses.length} vehicles</span>
            </div>
          </div>

          <div className="fleet-toolbar">
            <div className="fleet-tabs" role="group" aria-label="Fleet status filter">
              {([
                ["all", "All", buses.length],
                ["online", "Online", online],
                ["offline", "Offline", offline],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => { setFilter(value); setPage(0); }}
                >
                  <span>{label}</span><span className="tab-count">{count}</span>
                </button>
              ))}
            </div>

            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search buses"
                placeholder="Search bus or route…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              />
            </label>
          </div>

          {visibleRows.length ? (
            <div className="table-wrap">
              <table className="fleet-table">
                <thead>
                  <tr>
                    {([
                      ["number", "Bus"],
                      ["route", "Route"],
                      ["status", "Status"],
                    ] as const).map(([key, label]) => (
                      <th key={key}>
                        <button className="sort-button" onClick={() => sortBy(key)}>
                          {label}<ArrowUpDown size={11} />
                        </button>
                      </th>
                    ))}
                    <th>Speed</th>
                    <th>Updated</th>
                    <th>Driver</th>
                    <th><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((bus) => (
                    <tr key={bus.id} className={selected === bus.id ? "selected-row" : ""}>
                      <td>
                        <button
                          className="bus-link"
                          type="button"
                          onClick={() => selectBus(bus.id)}
                        >
                          <BusFront size={19} strokeWidth={1.8} />
                          Bus {bus.busNumber}
                        </button>
                      </td>
                      <td>{bus.route}</td>
                      <td>
                        <span className="status-text">
                          <i className={"status-dot " + (bus.trackingActive ? "green" : "muted")} />
                          {bus.trackingActive ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td>
                        {typeof bus.speed === "number"
                          ? Math.round(bus.speed * 0.621371) + " mph"
                          : "—"}
                      </td>
                      <td>{bus.lastUpdated.toLocaleTimeString()}</td>
                      <td>{driverByBus.get(bus.id) ?? "Not assigned"}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button
                            className="secondary admin-table-action"
                            type="button"
                            onClick={() => onOpenBus?.(bus.id)}
                            aria-label={"View Bus " + bus.busNumber + " details"}
                          >
                            Details
                          </button>
                          <button
                            className="secondary admin-delete admin-table-action"
                            type="button"
                            disabled={Boolean(deleting)}
                            onClick={() => void removeBus(bus)}
                            aria-label={"Delete Bus " + bus.busNumber}
                          >
                            <Trash2 size={14} />
                            {deleting === bus.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{buses.length ? "No buses match the current filters." : "No buses have been created yet."}</Empty>
          )}

          <div className="table-footer">
            <span>
              {rows.length ? `Showing ${currentPage * 8 + 1}–${Math.min((currentPage + 1) * 8, rows.length)} of ${rows.length} buses` : "0 buses"}
            </span>
            <nav className="pagination" aria-label="Fleet pages">
              <button aria-label="Previous fleet page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  aria-label={"Fleet page " + (index + 1)}
                  aria-current={currentPage === index ? "page" : undefined}
                  onClick={() => setPage(index)}
                >
                  {index + 1}
                </button>
              ))}
              <button aria-label="Next fleet page" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>
                <ChevronRight size={16} />
              </button>
            </nav>
          </div>
        </section>

        <aside className="overview-support">
          <section className="panel coverage-panel">
            <div className="panel-heading">
              <h2>Live coverage</h2>
              <span>{current ? "Selected Bus " + current.busNumber : "Fleet map"}</span>
            </div>
            <AdminFleetMap positions={positions} selectedId={current?.id} onSelect={selectBus} />
            <button className="panel-footer-link" type="button" onClick={() => onRefreshHint?.()}>
              Open live map <ArrowRight size={15} />
            </button>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Selected bus</h2>
            </div>
            {current ? (
              <>
                <div className="fields">
                  <div><dt>Bus</dt><dd>{current.busNumber}</dd></div>
                  <div><dt>Route</dt><dd>{current.route}</dd></div>
                  <div><dt>Status</dt><dd>{current.trackingActive ? "Online" : "Offline"}</dd></div>
                  <div><dt>Driver</dt><dd>{driverByBus.get(current.id) ?? "Not assigned"}</dd></div>
                </div>
                <button
                  className="panel-footer-link admin-selected-details"
                  type="button"
                  onClick={() => onOpenBus?.(current.id)}
                >
                  View bus details <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <Empty>No bus selected.</Empty>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
