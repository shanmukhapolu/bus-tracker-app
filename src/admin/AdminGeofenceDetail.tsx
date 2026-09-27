import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  Check,
  MapPinned,
  Pencil,
  Save,
  Undo2,
  Users,
} from "lucide-react";
import {
  LngLatBounds,
  Map as LibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { CARMEL_CENTER, MAP_STYLE_URL } from "../config/map";
import { assignBusGeofence, saveGeofence } from "../services/geofenceService";
import type { Bus } from "../types/bus";
import type { Geofence, GeofenceCoordinate } from "../types/geofence";
import type { GeofenceEntryEvent } from "./AdminGeofenceMonitor";
import { Badge, Empty, PageHeading } from "./UI";

const MAX_POINTS = 40;

function polygonFeature(
  coordinates: GeofenceCoordinate[],
  properties: Record<string, unknown> = {},
) {
  if (coordinates.length < 3) return null;
  const ring = [...coordinates, coordinates[0]];
  return {
    type: "Feature" as const,
    properties,
    geometry: {
      type: "Polygon" as const,
      coordinates: [ring],
    },
  };
}

export function AdminGeofenceDetail({
  geofence,
  buses,
  events,
  connected,
  error,
  onBack,
  onOpenGeofence,
}: {
  geofence: Geofence | null;
  buses: Bus[];
  events: GeofenceEntryEvent[];
  connected: boolean;
  error?: string;
  onBack: () => void;
  onOpenGeofence: (id: string) => void;
}) {
  const isNew = !geofence;
  const mapHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [editing, setEditing] = useState(isNew);
  const [drawing, setDrawing] = useState(isNew);
  const [name, setName] = useState(geofence?.name ?? "");
  const [coordinates, setCoordinates] = useState<GeofenceCoordinate[]>(
    geofence?.coordinates ?? [],
  );
  const [selectedBusIds, setSelectedBusIds] = useState<string[]>(
    buses
      .filter((bus) => Boolean(geofence && bus.geofenceId === geofence.id))
      .map((bus) => bus.id),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setName(geofence?.name ?? "");
    setCoordinates(geofence?.coordinates ?? []);
    setSelectedBusIds(
      buses
        .filter((bus) => Boolean(geofence && bus.geofenceId === geofence.id))
        .map((bus) => bus.id),
    );
    setEditing(!geofence);
    setDrawing(!geofence);
    setMessage("");
    setSaveError("");
  }, [geofence?.id, geofence?.name, geofence?.updatedAt]);

  useEffect(() => {
    if (!mapHost.current) return;

    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: mapHost.current,
        style: MAP_STYLE_URL,
        center: CARMEL_CENTER,
        zoom: 12.4,
        minZoom: 3,
        maxZoom: 19,
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
      });
    } catch {
      setMapError("Map requires WebGL. You can still manage the geofence below.");
      return;
    }

    mapRef.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );

    const timeout = window.setTimeout(() => {
      if (!instance.loaded()) {
        setMapError("Map is taking too long to load. Check your connection.");
      }
    }, 20000);

    instance.on("error", () => {
      if (!instance.loaded()) {
        setMapError("Some map resources could not load. Check your connection.");
      }
    });

    instance.on("load", () => {
      window.clearTimeout(timeout);
      setMapReady(true);
      setMapError("");

      instance.addSource("geofence-detail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: "geofence-detail-fill",
        type: "fill",
        source: "geofence-detail",
        paint: { "fill-color": "#2464b8", "fill-opacity": 0.16 },
      });
      instance.addLayer({
        id: "geofence-detail-line",
        type: "line",
        source: "geofence-detail",
        paint: { "line-color": "#142f50", "line-width": 3 },
      });
      instance.addSource("geofence-detail-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: "geofence-detail-points",
        type: "circle",
        source: "geofence-detail-points",
        paint: {
          "circle-radius": 5,
          "circle-color": "#2464b8",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
    });

    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(mapHost.current);

    return () => {
      window.clearTimeout(timeout);
      resizeObserver.disconnect();
      instance.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    const feature = polygonFeature(coordinates);

    (map.getSource("geofence-detail") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: feature ? [feature] : [],
    });

    (map.getSource("geofence-detail-points") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: editing
        ? coordinates.map((point, index) => ({
            type: "Feature" as const,
            properties: { index: index + 1 },
            geometry: {
              type: "Point" as const,
              coordinates: point,
            },
          }))
        : [],
    });
  }, [coordinates, editing, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || drawing) return;

    if (!coordinates.length) {
      mapRef.current.easeTo({
        center: CARMEL_CENTER,
        zoom: 12.4,
        duration: 350,
      });
      return;
    }

    if (coordinates.length === 1) {
      mapRef.current.easeTo({
        center: coordinates[0],
        zoom: 15,
        duration: 350,
      });
      return;
    }

    const bounds = new LngLatBounds();
    coordinates.forEach((point) => bounds.extend(point));
    mapRef.current.fitBounds(bounds, {
      padding: 70,
      maxZoom: 16,
      duration: 450,
    });
  }, [coordinates, drawing, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    const handleClick = (event: MapMouseEvent) => {
      if (!editing || !drawing || coordinates.length >= MAX_POINTS) return;

      setCoordinates((current) => [
        ...current,
        [event.lngLat.lng, event.lngLat.lat],
      ]);
      setSaveError("");
      setMessage("");
    };

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [coordinates.length, drawing, editing, mapReady]);

  const assignedBuses = useMemo(
    () =>
      geofence
        ? buses
            .filter((bus) => bus.geofenceId === geofence.id)
            .sort((a, b) =>
              a.busNumber.localeCompare(b.busNumber, undefined, {
                numeric: true,
              }),
            )
        : [],
    [buses, geofence],
  );

  const entryEvents = useMemo(
    () =>
      events
        .filter((event) => !geofence || event.geofenceId === geofence.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    [events, geofence],
  );

  const firstEntryByBus = useMemo(() => {
    const result = new Map<string, GeofenceEntryEvent>();

    [...entryEvents]
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((event) => {
        if (!result.has(event.busId)) result.set(event.busId, event);
      });

    return result;
  }, [entryEvents]);

  const orderedBuses = useMemo(() => {
    const withEntries = assignedBuses.filter((bus) =>
      firstEntryByBus.has(bus.id),
    );
    const withoutEntries = assignedBuses.filter(
      (bus) => !firstEntryByBus.has(bus.id),
    );

    withEntries.sort(
      (a, b) =>
        firstEntryByBus.get(a.id)!.createdAt -
        firstEntryByBus.get(b.id)!.createdAt,
    );

    return [...withEntries, ...withoutEntries];
  }, [assignedBuses, firstEntryByBus]);

  const startEdit = () => {
    setEditing(true);
    setDrawing(false);
    setName(geofence?.name ?? "");
    setCoordinates(geofence?.coordinates ?? []);
    setSelectedBusIds(assignedBuses.map((bus) => bus.id));
    setMessage("");
    setSaveError("");
  };

  const cancelEdit = () => {
    if (isNew) {
      onBack();
      return;
    }

    setEditing(false);
    setDrawing(false);
    setName(geofence.name);
    setCoordinates(geofence.coordinates);
    setSelectedBusIds(assignedBuses.map((bus) => bus.id));
    setMessage("");
    setSaveError("");
  };

  const redraw = () => {
    setCoordinates([]);
    setDrawing(true);
    setMessage("");
    setSaveError("");
  };

  const toggleBus = (busId: string) => {
    setSelectedBusIds((current) =>
      current.includes(busId)
        ? current.filter((id) => id !== busId)
        : [...current, busId],
    );
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setSaveError("");

    try {
      const savedId = await saveGeofence(
        geofence?.id ?? null,
        name,
        coordinates,
      );

      const desired = new Set(selectedBusIds);
      const currentAssignments = new Map(
        buses.map((bus) => [bus.id, bus.geofenceId ?? ""]),
      );

      await Promise.all(
        buses
          .filter((bus) => {
            const currentlyAssigned =
              (currentAssignments.get(bus.id) ?? "") === savedId;
            return currentlyAssigned !== desired.has(bus.id);
          })
          .map((bus) =>
            assignBusGeofence(
              bus.id,
              desired.has(bus.id) ? savedId : "",
            ),
          ),
      );

      setEditing(false);
      setDrawing(false);
      setMessage(isNew ? "Geofence created." : "Geofence updated.");
      onOpenGeofence(savedId);
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Could not save the geofence.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length >= 2 && coordinates.length >= 3;

  return (
    <div className="geofence-detail-page">
      <PageHeading
        title={isNew ? "New geofence" : geofence.name}
        description={
          isNew
            ? "Create the area, then assign the buses that should be monitored."
            : "Monitor entries, review bus order, and manage the buses assigned to this zone."
        }
      >
        <div className="geofence-detail-actions">
          <button className="secondary" type="button" onClick={onBack}>
            <ArrowLeft size={15} />
            All geofences
          </button>

          {!isNew && !editing && (
            <button className="primary" type="button" onClick={startEdit}>
              <Pencil size={15} />
              Edit
            </button>
          )}

          {editing && (
            <>
              {!isNew && (
                <button className="secondary" type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
              <button
                className="primary"
                type="button"
                disabled={!canSave || saving}
                onClick={() => void save()}
              >
                <Save size={15} />
                {saving
                  ? "Saving…"
                  : isNew
                    ? "Create geofence"
                    : "Save changes"}
              </button>
            </>
          )}
        </div>
      </PageHeading>

      {(message || saveError || error) && (
        <div
          className={saveError || error ? "error-box" : "notice"}
          role={saveError || error ? "alert" : "status"}
        >
          {saveError || error || message}
        </div>
      )}

      <div className="geofence-detail-grid">
        <section className="panel geofence-detail-map-panel">
          <div className="panel-heading">
            <div>
              <h2>Geofence area</h2>
              <span>
                {editing
                  ? drawing
                    ? String(coordinates.length) +
                      "/" +
                      MAX_POINTS +
                      " points · click the map to add corners"
                    : "Edit the name or redraw the polygon."
                  : String(coordinates.length) + " polygon points"}
              </span>
            </div>
            <MapPinned size={18} />
          </div>

          <div
            className={
              drawing
                ? "geofence-detail-map drawing"
                : "geofence-detail-map"
            }
          >
            <div
              className="map-host"
              ref={mapHost}
              aria-label="Geofence map"
            />

            {editing && drawing && (
              <div className="geofence-detail-draw-hint">
                <MapPinned size={15} />
                Click the map to place each corner.
              </div>
            )}

            {mapError && (
              <div className="map-feedback" role="alert">
                {mapError}
              </div>
            )}
          </div>

          {editing && (
            <div className="geofence-detail-map-actions">
              <button className="secondary" type="button" onClick={redraw}>
                <Undo2 size={14} />
                Redraw area
              </button>

              {drawing && coordinates.length > 0 && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    setCoordinates((current) => current.slice(0, -1))
                  }
                >
                  Undo last point
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel geofence-detail-assigned-panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? "Assigned buses" : "Buses in this geofence"}</h2>
              <span>
                {editing
                  ? "Select the buses monitored by this zone."
                  : String(assignedBuses.length) +
                    " assigned bus" +
                    (assignedBuses.length === 1 ? "" : "es")}
              </span>
            </div>
            <Users size={18} />
          </div>

          {editing ? (
            <div className="geofence-bus-picker">
              {buses.length ? (
                buses
                  .slice()
                  .sort((a, b) =>
                    a.busNumber.localeCompare(b.busNumber, undefined, {
                      numeric: true,
                    }),
                  )
                  .map((bus) => {
                    const checked = selectedBusIds.includes(bus.id);
                    const otherGeofence =
                      bus.geofenceId &&
                      bus.geofenceId !== geofence?.id
                        ? "Assigned to another geofence"
                        : "";

                    return (
                      <label
                        key={bus.id}
                        className={
                          checked
                            ? "geofence-bus-option checked"
                            : "geofence-bus-option"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBus(bus.id)}
                        />
                        <span className="geofence-bus-check">
                          <Check size={13} />
                        </span>
                        <span className="geofence-bus-copy">
                          <strong>Bus {bus.busNumber}</strong>
                          <span>{bus.route}</span>
                          {otherGeofence && <small>{otherGeofence}</small>}
                        </span>
                        <Badge
                          value={bus.trackingActive ? "online" : "offline"}
                        />
                      </label>
                    );
                  })
              ) : (
                <Empty>No registered buses are available.</Empty>
              )}

              <p className="geofence-detail-note">
                Assigning a bus here moves it from any other geofence.
              </p>
            </div>
          ) : assignedBuses.length ? (
            <div className="geofence-assigned-list">
              {assignedBuses.map((bus) => (
                <div className="geofence-assigned-bus" key={bus.id}>
                  <span className="geofence-bus-number">
                    Bus {bus.busNumber}
                  </span>
                  <span>{bus.route}</span>
                  <Badge
                    value={bus.trackingActive ? "online" : "offline"}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              No buses are assigned to this geofence. Use Edit to assign them.
            </Empty>
          )}
        </section>
      </div>

      <div className="geofence-detail-bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Alert center</h2>
              <span>Recorded bus entries with the detected time.</span>
            </div>
            <BellRing size={18} />
          </div>

          {entryEvents.length ? (
            <div className="geofence-alert-list">
              {entryEvents.map((event) => (
                <div className="geofence-alert-row" key={event.id}>
                  <div className="geofence-alert-icon">
                    <BellRing size={14} />
                  </div>
                  <div>
                    <strong>
                      Bus {event.busNumber} entered the zone
                    </strong>
                    <span>
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              No bus-entry alerts have been recorded for this geofence yet.
            </Empty>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Bus order</h2>
              <span>Order by first recorded entry into this zone.</span>
            </div>
            <Users size={18} />
          </div>

          {orderedBuses.length ? (
            <div className="geofence-order-list">
              {orderedBuses.map((bus, index) => {
                const entry = firstEntryByBus.get(bus.id);

                return (
                  <div className="geofence-order-row" key={bus.id}>
                    <span className="geofence-order-rank">
                      {entry
                        ? String(
                            [...firstEntryByBus.keys()].indexOf(bus.id) + 1,
                          )
                        : "—"}
                    </span>
                    <div>
                      <strong>Bus {bus.busNumber}</strong>
                      <span>
                        {entry
                          ? new Date(entry.createdAt).toLocaleTimeString()
                          : "No entry recorded yet"}
                      </span>
                    </div>
                    <Badge
                      value={bus.trackingActive ? "online" : "offline"}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No buses are assigned to this geofence.</Empty>
          )}
        </section>
      </div>

      {!connected && (
        <p className="geofence-detail-status">
          Live monitoring is currently disconnected. Existing geofence data remains
          available.
        </p>
      )}
    </div>
  );
}
