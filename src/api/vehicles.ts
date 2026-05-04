import { api } from "./client";
import { Vehicle } from "./types";

export async function fetchVehicles(): Promise<Vehicle[]> {
  const resp = await api.get<Vehicle[] | { results: Vehicle[] }>("/api/admin/vehicles/");
  return Array.isArray(resp.data) ? resp.data : resp.data.results ?? [];
}

export async function fetchVehicle(id: number | string): Promise<Vehicle> {
  const resp = await api.get<Vehicle>(`/api/admin/vehicles/${id}/`);
  return resp.data;
}
