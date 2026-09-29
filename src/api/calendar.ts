import { api } from "./client";
import type { CalendarTokenResponse } from "./types";

// Admin's personal iCal feed of every fleet booking. When token is null,
// no feed has been generated for this account yet — POST /rotate/ creates
// one. Reminders 24h and 2h before each event fire natively on the
// phone's Calendar app so operators are notified even when this app is
// closed.
export async function fetchCalendarToken(): Promise<CalendarTokenResponse> {
  const resp = await api.get<CalendarTokenResponse>(
    "/api/admin/calendar-token/"
  );
  return resp.data;
}

export async function rotateCalendarToken(): Promise<CalendarTokenResponse> {
  const resp = await api.post<CalendarTokenResponse>(
    "/api/admin/calendar-token/rotate/"
  );
  return resp.data;
}
