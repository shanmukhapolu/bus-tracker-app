import { useEffect, useRef } from "react";
import { Map as LibreMap, NavigationControl } from "maplibre-gl";
import { CARMEL_CENTER, MAP_STYLE_URL } from "../config/map";
import type { Coordinate } from "../types/bus";

interface Props { points: Coordinate[]; onChange: (points: Coordinate[]) => void; }
const latest: { current: ((points: Coordinate[]) => void) | null } = { current: null };
/** Lightweight polygon editor for administrators; geometry is persisted only after Save geofence. */
export function GeofenceMapEditor({ points, onChange }: Props) {
  latest.current = onChange;
  const container = useRef<HTMLDivElement>(null); const map = useRef<LibreMap | null>(null); const pointsRef = useRef(points); pointsRef.current = points;
  useEffect(() => { if (!container.current) return; const instance = new LibreMap({container:container.current,style:MAP_STYLE_URL,center:CARMEL_CENTER,zoom:12.5}); map.current=instance; instance.addControl(new NavigationControl(),"top-right"); instance.on("click", event => latest.current?.([...pointsRef.current, [event.lngLat.lng,event.lngLat.lat]])); return()=>{instance.remove();map.current=null;}; }, []); // click handler intentionally reads the current callback below
  useEffect(()=>{const instance=map.current;if(!instance)return;const apply=()=>{const feature={type:"Feature" as const,properties:{},geometry:{type:"Polygon" as const,coordinates:[(points.length>=3?[...points,points[0]]:points).map(point=>[point[0],point[1]])]}};if(instance.getSource("geofence")) (instance.getSource("geofence") as unknown as {setData:(d:unknown)=>void}).setData(feature);else {instance.addSource("geofence",{type:"geojson",data:feature});instance.addLayer({id:"geofence-fill",type:"fill",source:"geofence",paint:{"fill-color":"#2464b8","fill-opacity":0.18}});instance.addLayer({id:"geofence-line",type:"line",source:"geofence",paint:{"line-color":"#2464b8","line-width":3}});}}; if(instance.isStyleLoaded())apply();else instance.once("load",apply);},[points]);
  return <div className="geofence-map" ref={container} aria-label="Map: click to add geofence polygon points" />;
}
