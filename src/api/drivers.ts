import { api } from "./client";
import { BlockedDate, Driver, PaymentSummary } from "./types";

// Admin views
export async function fetchDrivers(): Promise<Driver[]> {
  const resp = await api.get<Driver[] | { results: Driver[] }>("/api/admin/drivers/");
  return Array.isArray(resp.data) ? resp.data : resp.data.results ?? [];
}

// Driver self-service
export async function fetchMyBlockedDates(): Promise<BlockedDate[]> {
  const resp = await api.get<BlockedDate[] | { results: BlockedDate[] }>(
    "/api/driver/blocked-dates/"
  );
  return Array.isArray(resp.data) ? resp.data : resp.data.results ?? [];
}

export async function createMyBlockedDate(date: string, reason?: string): Promise<BlockedDate> {
  const resp = await api.post<BlockedDate>("/api/driver/blocked-dates/", { date, reason });
  return resp.data;
}

export async function deleteMyBlockedDate(id: number): Promise<void> {
  await api.delete(`/api/driver/blocked-dates/${id}/delete/`);
}

export async function fetchPaymentSummary(
  startDate?: string,
  endDate?: string
): Promise<PaymentSummary> {
  const resp = await api.get<PaymentSummary>("/api/driver/payment-summary/", {
    params: { start_date: startDate, end_date: endDate },
  });
  return resp.data;
}
