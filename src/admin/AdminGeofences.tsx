import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as LibreMap,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { MapPinned, MousePointer2, Pencil, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { CARMEL_CENTER, MAP_STYLE_URL } from "../config/map";
import type { Bus } from "../types/bus";
import type { Geofence, GeofenceCoordinate } from "../types/geofence";
import { deleteGeofence, saveGeofence } from "../services/geofenceService";
import { Empty, ErrorState, PageHeading } from "./UI";

interface Props {
  geofences: Geofence[];
  buses: Bus[];
  connected: boolean;
  error?: string;
}

const MAX_POINTS = 40;

function polygonFeature(coordinates: GeofenceCoordinate[], properties: Record<string, unknown> = {}) {
  if (coordinates.length < 3) return null;
  const ring = [...coordinates, coordinates[0]];
  return {
    type: "Feature" as const,
    properties,
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

export function AdminGeofences({ geofences, buses, connected, error }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<GeofenceCoordinate[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const selected = geofences.find((item) => item.id === selectedId);
  const assignedCount = useMemo(
    () => (geofenceId: string) => buses.filter((bus) => bus.geofenceId === geofenceId).length,
    [buses],
  );

  useEffect(() => {
    if (!host.current) return;
    let instance: LibreMap;
    setMapError("");
    setMapReady(false);
    try {
      instance = new LibreMap({
        container: host.current,
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
      setMapError("Map requires WebGL. Geofence editing remains available without it.");
      return;
    }
    mapRef.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(host.current);
    const timeout = window.setTimeout(() => {
      if (!instance.loaded()) setMapError("Map is taking too long to load. Check your connection.");
    }, 20000);
    instance.on("error", () => {
      if (!instance.loaded()) setMapError("Some map resources could not load. Check your connection.");
    });
    instance.on("load", () => {
      window.clearTimeout(timeout);
      setMapReady(true);
      setMapError("");
      instance.addSource("geofences", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({
        id: "geofences-fill",
        type: "fill",
        source: "geofences",
        paint: { "fill-color": "#2464b8", "fill-opacity": 0.1 },
      });
      instance.addLayer({
        id: "geofences-line",
        type: "line",
        source: "geofences",
        paint: { "line-color": "#2464b8", "line-width": 2, "line-opacity": 0.75 },
      });
      instance.addSource("geofence-selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({
        id: "geofence-selected-fill",
        type: "fill",
        source: "geofence-selected",
        paint: { "fill-color": "#2464b8", "fill-opacity": 0.18 },
      });
      instance.addLayer({
        id: "geofence-selected-line",
        type: "line",
        source: "geofence-selected",
        paint: { "line-color": "#142f50", "line-width": 3 },
      });
      instance.addSource("geofence-draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({
        id: "geofence-draft-fill",
        type: "fill",
        source: "geofence-draft",
        paint: { "fill-color": "#f0bd4b", "fill-opacity": 0.18 },
      });
      instance.addLayer({
        id: "geofence-draft-line",
        type: "line",
        source: "geofence-draft",
        paint: { "line-color": "#b68119", "line-width": 3, "line-dasharray": [1.5, 1.5] },
      });
      instance.addSource("geofence-draft-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({
        id: "geofence-draft-points",
        type: "circle",
        source: "geofence-draft-points",
        paint: { "circle-radius": 5, "circle-color": "#142f50", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });
    });
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
    const collection = {
      type: "FeatureCollection" as const,
      features: geofences.flatMap((geofence) => {
        const feature = polygonFeature(geofence.coordinates, { id: geofence.id, name: geofence.name });
        return feature ? [feature] : [];
      }),
    };
    (map.getSource("geofences") as GeoJSONSource).setData(collection);
    const selectedFeature = selected ? polygonFeature(selected.coordinates, { id: selected.id }) : null;
    const selectedCollection = { type: "FeatureCollection" as const, features: selectedFeature ? [selectedFeature] : [] };
    (map.getSource("geofence-selected") as GeoJSONSource).setData(selectedCollection);
    const draftFeature = polygonFeature(draft, { draft: true });
    const draftCollection = { type: "FeatureCollection" as const, features: draftFeature ? [draftFeature] : [] };
    (map.getSource("geofence-draft") as GeoJSONSource).setData(draftCollection);
    const pointFeatures = draft.map((point, index) => ({
      type: "Feature" as const,
      properties: { index: index + 1 },
      geometry: { type: "Point" as const, coordinates: point },
    }));
    (map.getSource("geofence-draft-points") as GeoJSONSource).setData({
      type: "FeatureCollection" as const,
      features: pointFeatures,
    });
  }, [draft, geofences, mapReady, selected]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const handleClick = (event: MapMouseEvent) => {
      if (!drawing || draft.length >= MAX_POINTS) return;
      setDraft((points) => [...points, [event.lngLat.lng, event.lngLat.lat]]);
      setMessage("");
      setSaveError("");
    };
    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [draft.length, drawing, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const coordinates = (drawing ? draft : selected?.coordinates) ?? geofences.flatMap((item) => item.coordinates);
    if (!coordinates.length) {
      map.easeTo({ center: CARMEL_CENTER, zoom: 12.4, duration: 450 });
      return;
    }
    if (coordinates.length === 1) {
      map.easeTo({ center: coordinates[0], zoom: 15, duration: 450 });
      return;
    }
    const bounds = new LngLatBounds();
    coordinates.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 500 });
  }, [drawing, draft, geofences, mapReady, selected]);

  const startNew = () => {
    setSelectedId("");
    setName("");
    setDraft([]);
    setDrawing(true);
    setMessage("");
    setSaveError("");
  };

  const selectGeofence = (geofence: Geofence) => {
    setSelectedId(geofence.id);
    setName(geofence.name);
    setDraft(geofence.coordinates);
    setDrawing(false);
    setMessage("");
    setSaveError("");
  };

  const redraw = () => {
    setDraft([]);
    setDrawing(true);
    setMessage("");
    setSaveError("");
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setSaveError("");
    try {
      const id = await saveGeofence(selectedId || null, name, draft);
      setSelectedId(id);
      setDrawing(false);
      setMessage(selectedId ? "Geofence updated." : "Geofence created.");
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save the geofence.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (geofence: Geofence) => {
    const count = assignedCount(geofence.id);
    const suffix = count ? ` ${count} bus${count === 1 ? "" : "es"} will be unassigned.` : "";
    if (!window.confirm(`Delete ${geofence.name}?${suffix}`)) return;
    setDeleting(geofence.id);
    setMessage("");
    setSaveError("");
    try {
      await deleteGeofence(geofence.id);
      if (selectedId === geofence.id) startNew();
      setMessage(`Geofence ${geofence.name} deleted.`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not delete the geofence.");
    } finally {
      setDeleting("");
    }
  };

  const canSave = name.trim().length >= 2 && draft.length >= 3;

  return (
    <div className="geofences-page">
      <PageHeading
        title="Geofences"
        description="Create polygon areas and get an admin alert when an assigned bus enters one."
      >
        <button className="primary" type="button" onClick={startNew}>
          <Plus size={16} />
          New geofence
        </button>
      </PageHeading>

      <div className="geofence-overview">
        <div className="geofence-overview-card">
          <span>Saved areas</span>
          <strong>{geofences.length}</strong>
        </div>
        <div className="geofence-overview-card">
          <span>Assigned buses</span>
          <strong>{buses.filter((bus) => Boolean(bus.geofenceId)).length}</strong>
        </div>
        <div className="geofence-overview-card">
          <span>Live monitoring</span>
          <strong>{connected ? "Active" : "Offline"}</strong>
        </div>
      </div>

      {(message || saveError || error) && (
        <div className={saveError || error ? "error-box" : "notice"} role={saveError || error ? "alert" : "status"}>
          {saveError || error || message}
        </div>
      )}

      <div className="geofence-workspace">
        <section className="panel geofence-map-panel">
          <div className="geofence-map-toolbar">
            <div>
              <strong>{drawing ? "Plot the geofence" : selected ? selected.name : "Geofence map"}</strong>
              <span>{drawing ? `${draft.length}/${MAX_POINTS} points · click the map to add corners` : "Select an area or start a new one"}</span>
            </div>
            {drawing && (
              <div className="geofence-map-toolbar-actions">
                <button className="secondary" type="button" disabled={!draft.length} onClick={() => setDraft((points) => points.slice(0, -1))}>
                  <Undo2 size={14} /> Undo
                </button>
              </div>
            )}
          </div>
          <div className={drawing ? "geofence-map is-drawing" : "geofence-map"}>
            <div className="map-host" ref={host} aria-label="Geofence editing map" />
            {drawing && <div className="geofence-draw-hint"><MousePointer2 size={15} /> Click the map to place polygon corners</div>}
            {mapError && <div className="map-feedback" role="alert">{mapError}</div>}
          </div>
        </section>

        <aside className="geofence-side">
          <section className="panel geofence-editor">
            <div className="panel-heading">
              <div>
                <h2>{selected ? "Edit geofence" : "New geofence"}</h2>
                <span>{draft.length} polygon points</span>
              </div>
              <MapPinned size={18} />
            </div>
            <label className="admin-field-label">
              Name
              <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. High School" />
            </label>
            <div className="geofence-editor-actions">
              <button className="secondary" type="button" onClick={redraw}>
                <Pencil size={14} /> Redraw area
              </button>
              <button className="primary" type="button" disabled={!canSave || saving} onClick={() => void save()}>
                <Save size={14} /> {saving ? "Saving…" : selected ? "Save changes" : "Save geofence"}
              </button>
            </div>
            {!canSave && <p className="geofence-editor-note">Add a name and at least three map points before saving.</p>}
          </section>

          <section className="panel geofence-list-panel">
            <div className="panel-heading">
              <div>
                <h2>Saved geofences</h2>
                <span>{geofences.length} area{geofences.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            {geofences.length ? (
              <div className="geofence-list">
                {geofences.map((geofence) => {
                  const count = assignedCount(geofence.id);
                  return (
                    <div key={geofence.id} className={selectedId === geofence.id ? "geofence-list-item selected" : "geofence-list-item"}>
                      <button className="geofence-list-main" type="button" onClick={() => selectGeofence(geofence)}>
                        <span className="geofence-list-icon"><MapPinned size={15} /></span>
                        <span className="geofence-list-copy">
                          <strong>{geofence.name}</strong>
                          <span>{geofence.coordinates.length} points · {count} assigned bus{count === 1 ? "" : "es"}</span>
                        </span>
                      </button>
                      <button className="icon-action danger" type="button" disabled={deleting === geofence.id} onClick={() => void remove(geofence)} aria-label={`Delete ${geofence.name}`} title="Delete geofence">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>Create your first polygon area to start monitoring entries.</Empty>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}