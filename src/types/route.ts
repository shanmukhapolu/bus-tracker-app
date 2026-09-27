export interface RouteStop {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  order: number;
}

export interface DriverRoute {
  id: string;
  name: string;
  school: string;
  enabled: boolean;
  stops: RouteStop[];
}
