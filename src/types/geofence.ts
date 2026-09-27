export type GeofenceCoordinate = [number, number];

export interface Geofence {
  id: string;
  name: string;
  coordinates: GeofenceCoordinate[];
  createdAt?: number;
  updatedAt?: number;
}