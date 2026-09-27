import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { Edit3, MapPin, Plus, Save, Trash2, X } from "lucide-react";
import { MAP_STYLE_URL, CARMEL_CENTER } from "../config/map";
import {
  deleteGeofence,
  saveGeofence,
  type Geofence,
  type GeofencePoint,
} from "../services/geofenceService";
import { Empty, ErrorState, Loading, PageHeading } from "./UI";

function pointsToFeature(points: GeofencePoint[]) {
  const coordinates = points.map((point) => [point.longitude, point.latitude]);
  if (coordinates.length >= 3) {
    coordinates.push(coordinates[0]);
  }
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
    properties: {},
  };
}

function updateMapGeometry(map: MapLibreMap, points: GeofencePoint[], existing?: GeofencePoint[]) {
  const polygonSource = map.getSource("geofence-polygon") as maplibregl.GeoJSONSource | undefined;
  polygonSource?.setData({
    type: "FeatureCollection",
    features: points.length >= 3 ? [pointsToFeature(points)] : [],
  });

  const lineSource = map.getSource("geofence-line") as maplibregl.GeoJSONSource | undefined;
  lineSource?.setData({
    type: "FeatureCollection",
    features: points.length >= 2
      ? [{
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: points.map((point) => [point.longitude, point.latitude]),
          },
          properties: {},
        }]
      : [],
  });

  if (existing) {
    const existingSource = map.getSource("geofence-existing") as maplibregl.GeoJSONSource | undefined;
    existingSource?.setData({
      type: "FeatureCollection",
      features: existing.length >= 3 ? [pointsToFeature(existing)] : [],
    });
  }
}

export function AdminGeofences({
  geofences,
  error,
  connected,
}: {
  geofences: Geofence[];
  error?: string;
  connected: boolean;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [editing, setEditing] = useState<Geofence | null>(null);
  const [draftPoints, setDraftPoints] = useState<GeofencePoint[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE_URL,
      center: CARMEL_CENTER,
      zoom: 12.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("geofence-existing", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "geofence-existing-fill",
        type: "fill",
        source: "geofence-existing",
        paint: { "fill-color": "#2464b8", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "geofence-existing-line",
        type: "line",
        source: "geofence-existing",
        paint: { "line-color": "#2464b8", "line-width": 2, "line-opacity": 0.55 },
      });
      map.addSource("geofence-polygon", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "geofence-fill",
        type: "fill",
        source: "geofence-polygon",
        paint: { "fill-color": "#f6ca52", "fill-opacity": 0.24 },
      });
      map.addLayer({
        id: "geofence-outline",
        type: "line",
        source: "geofence-polygon",
        paint: { "line-color": "#142f50", "line-width": 3 },
      });
      map.addSource("geofence-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "geofence-draft-line",
        type: "line",
        source: "geofence-line",
        paint: { "line-color": "#2464b8", "line-width": 3, "line-dasharray": [2, 1] },
      });
    });

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      if (!editing) return;
      setDraftPoints((current) => [
        ...current,
        { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
      ]);
    };

    map.on("click", handleClick);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [editing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateMapGeometry(map, draftPoints);
  }, [draftPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("geofence-existing") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: geofences
        .filter((geofence) => geofence.points.length >= 3)
        .map((geofence) => pointsToFeature(geofence.points)),
    });
  }, [geofences]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = draftPoints.map(
      (point, index) =>
        new maplibregl.Marker({ color: "#142f50" })
          .setLngLat([point.longitude, point.latitude])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setText(`Point ${index + 1}`))
          .addTo(map),
    );
  }, [draftPoints]);

  const startNew = () => {
    setEditing({ id: "", name: "", points: [], enabled: true });
    setDraftPoints([]);
    setName("");
    setSaveError("");
    setMessage("");
  };

  const edit = (geofence: Geofence) => {
    setEditing(geofence);
    setDraftPoints(geofence.points);
    setName(geofence.name);
    setSaveError("");
    setMessage("");
  };

  const cancel = () => {
    setEditing(null);
    setDraftPoints([]);
    setName("");
    setSaveError("");
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    setMessage("");

    try {
      const saved = await saveGeofence({
        id: editing?.id || undefined,
        name,
        points: draftPoints,
        enabled: true,
        createdAt: editing?.createdAt,
      });
      setEditing(saved);
      setDraftPoints(saved.points);
      setMessage(`${saved.name} saved.`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save geofence.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (geofence: Geofence) => {
    if (!window.confirm(`Delete geofence "${geofence.name}"?`)) return;
    try {
      await deleteGeofence(geofence.id);
      if (editing?.id === geofence.id) cancel();
      setMessage(`${geofence.name} deleted.`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not delete geofence.");
    }
  };

  if (error && !geofences.length) return <ErrorState message={error} />;
  if (!connected && !geofences.length) return <Loading text="Waiting for geofence data…" />;

  return (
    <div className="geofence-page">
      <PageHeading
        title="Geofences"
        description="Draw named areas on the map and trigger an admin alert when an assigned bus enters one."
      >
        <button className="primary geofence-new-button" type="button" onClick={startNew}>
          <Plus size={16} /> New geofence
        </button>
      </PageHeading>

      <div className="geofence-workspace">
        <section className="panel geofence-map-panel">
          <div className="geofence-map-toolbar">
            <div>
              <strong>{editing ? (editing.id ? "Edit geofence" : "Draw geofence") : "Geofence map"}</strong>
              <span>{editing ? "Tap the map to add polygon points." : "Select a geofence or create a new one."}</span>
            </div>
            {editing && (
              <button className="secondary" type="button" onClick={cancel}>
                <X size={15} /> Cancel
              </button>
            )}
          </div>
          <div ref={mapContainer} className="geofence-map" />
          {editing && (
            <div className="geofence-draw-hint">
              <MapPin size={15} />
              {draftPoints.length} point{draftPoints.length === 1 ? "" : "s"} placed
              {draftPoints.length >= 3 ? " • Polygon ready" : " • Add at least 3"}
            </div>
          )}
        </section>

        <aside className="geofence-side">
          {editing ? (
            <section className="panel geofence-editor">
              <div className="panel-heading">
                <div>
                  <h2>{editing.id ? "Edit area" : "New area"}</h2>
                  <span>Name and save the polygon.</span>
                </div>
                <Edit3 size={18} />
              </div>
              <label className="admin-field-label">
                Geofence name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. West Parking Lot" />
              </label>
              <div className="geofence-points">
                {draftPoints.map((point, index) => (
                  <div key={`${point.latitude}-${point.longitude}-${index}`}>
                    <span>Point {index + 1}</span>
                    <code>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</code>
                  </div>
                ))}
              </div>
              <div className="geofence-editor-actions">
                <button className="secondary" type="button" onClick={() => setDraftPoints([])} disabled={!draftPoints.length}>
                  Clear points
                </button>
                <button className="primary" type="button" onClick={() => void save()} disabled={saving}>
                  <Save size={15} /> {saving ? "Saving…" : "Save geofence"}
                </button>
              </div>
              {saveError && <div className="error-box">{saveError}</div>}
              {message && <div className="notice">{message}</div>}
            </section>
          ) : (
            <section className="panel geofence-list-panel">
              <div className="panel-heading">
                <div>
                  <h2>Saved areas</h2>
                  <span>{geofences.length} geofence{geofences.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              {geofences.length ? (
                <div className="geofence-list">
                  {geofences.map((geofence) => (
                    <div className="geofence-list-item" key={geofence.id}>
                      <div className="geofence-list-copy">
                        <strong>{geofence.name}</strong>
                        <span>{geofence.points.length} points</span>
                      </div>
                      <div className="geofence-list-actions">
                        <button className="icon-action" type="button" onClick={() => edit(geofence)} aria-label={`Edit ${geofence.name}`}>
                          <Edit3 size={15} />
                        </button>
                        <button className="icon-action danger" type="button" onClick={() => void remove(geofence)} aria-label={`Delete ${geofence.name}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No geofences have been created yet.</Empty>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
