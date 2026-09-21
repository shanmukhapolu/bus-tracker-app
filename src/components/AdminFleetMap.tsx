import { useEffect, useRef, useState } from "react";
import { Map as LibreMap, NavigationControl } from "maplibre-gl";
import type { Bus } from "../types/bus";
import type { GeofenceRecord, PolygonPoint } from "../services/adminService";
import { CARMEL_CENTER, MAP_STYLE_URL } from "../config/map";

interface Props {
  buses: Bus[];
  geofences: GeofenceRecord[];
  draftPolygon?: PolygonPoint[];
  drawing?: boolean;
  onMapClick?: (point: PolygonPoint) => void;
}

function polygonFeature(points: PolygonPoint[]) {
  if (points.length < 3) return null;
  const coordinates = points.map((point) => [
    point.longitude,
    point.latitude,
  ]);

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push(first);
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates],
    },
  };
}

export function AdminFleetMap({
  buses,
  geofences,
  draftPolygon = [],
  drawing = false,
  onMapClick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LibreMap | null>(null);
  const markers = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!container.current) return;

    const instance = new LibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: CARMEL_CENTER,
      zoom: 12.6,
      minZoom: 3,
      maxZoom: 19,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
    });

    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );

    instance.on("load", () => {
      instance.addSource("admin-geofences", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      instance.addLayer({
        id: "admin-geofence-fill",
        type: "fill",
        source: "admin-geofences",
        paint: {
          "fill-color": "#2464b8",
          "fill-opacity": 0.14,
        },
      });
      instance.addLayer({
        id: "admin-geofence-line",
        type: "line",
        source: "admin-geofences",
        paint: {
          "line-color": "#2464b8",
          "line-width": 2,
        },
      });

      instance.addSource("admin-geofence-draft", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      instance.addLayer({
        id: "admin-geofence-draft-fill",
        type: "fill",
        source: "admin-geofence-draft",
        paint: {
          "fill-color": "#187747",
          "fill-opacity": 0.14,
        },
      });
      instance.addLayer({
        id: "admin-geofence-draft-line",
        type: "line",
        source: "admin-geofence-draft",
        paint: {
          "line-color": "#187747",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
    });

    if (onMapClick) {
      instance.on("click", (event) => {
        if (drawing) {
          onMapClick({
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat,
          });
        }
      });
    }

    setMap(instance);

    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("admin-geofences") as
      | { setData: (data: unknown) => void }
      | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: geofences
        .filter((geofence) => geofence.enabled && geofence.polygon.length >= 3)
        .map((geofence) => ({
          ...(polygonFeature(geofence.polygon) as object),
          properties: {
            name: geofence.name,
            id: geofence.id,
          },
        })),
    });
  }, [map, geofences]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("admin-geofence-draft") as
      | { setData: (data: unknown) => void }
      | undefined;
    if (!source) return;

    const feature = polygonFeature(draftPolygon);
    source.setData({
      type: "FeatureCollection",
      features: feature ? [feature] : [],
    });
  }, [map, draftPolygon]);

  useEffect(() => {
    if (!map) return;

    const currentIds = new Set(
      buses
        .filter((bus) => bus.trackingActive)
        .map((bus) => bus.id),
    );

    markers.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });

    buses
      .filter((bus) => bus.trackingActive)
      .forEach((bus) => {
        let marker = markers.current.get(bus.id);

        if (!marker) {
          const element = document.createElement("div");
          element.style.width = "18px";
          element.style.height = "18px";
          element.style.borderRadius = "50%";
          element.style.background = "#2464b8";
          element.style.border = "3px solid white";
          element.style.boxShadow = "0 2px 10px #10294155";
          element.title = `Bus ${bus.busNumber}`;

          marker = new (window as any).maplibregl?.Marker
            ? new (window as any).maplibregl.Marker({ element })
            : null;

          // Prefer the imported MapLibre marker constructor without making
          // React own the map marker DOM.
          if (!marker) {
            import("maplibre-gl").then(({ Marker }) => {
              if (!markers.current.has(bus.id) && map) {
                const created = new Marker({ element })
                  .setLngLat([bus.longitude, bus.latitude])
                  .addTo(map);
                markers.current.set(bus.id, created);
              }
            });
            return;
          }

          marker
            .setLngLat([bus.longitude, bus.latitude])
            .addTo(map);
          markers.current.set(bus.id, marker);
        } else {
          marker.setLngLat([bus.longitude, bus.latitude]);
        }
      });
  }, [map, buses]);

  return (
    <div className="admin-map-wrap">
      <div className="admin-map" ref={container} />
      {drawing && (
        <div className="admin-map-draw-hint">
          Click the map to add polygon points.
        </div>
      )}
    </div>
  );
}
