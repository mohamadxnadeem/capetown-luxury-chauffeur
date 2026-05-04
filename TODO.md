# TODO — v2 punch list

## Verify before anything else
- [ ] Set the real Railway base URL in `app.json` (`expo.extra.apiBaseUrl`).
- [ ] Set `expo.extra.eas.projectId` so push tokens can be issued.
- [ ] Curl every endpoint listed in `src/api/types.ts` and replace the guessed
      shapes with verified ones. The current types use `[key: string]: unknown`
      escape hatches — remove those once the real fields are nailed down.

## Admin write flows (skipped in v1)
- [ ] `NewBookingScreen`: form with car → driver auto-fill, dates, customer
      info, day list. Wire `POST /api/admin/bookings/create/` then per-day
      `POST /api/admin/bookings/<id>/days/create/`.
- [ ] Edit booking: `PATCH /api/admin/bookings/<id>/update/`.
- [ ] Delete booking: `DELETE /api/admin/bookings/<id>/delete/`.
- [ ] Booking-day edit/delete via `/api/admin/booking-days/<id>/...`.
- [ ] Admin blocked-dates CRUD via `/api/admin/blocked-dates/...`.
- [ ] `DriverListScreen` + driver detail (`GET /api/admin/drivers/<id>/`).
- [ ] `VehicleListScreen` + availability lookups
      (`/api/admin/vehicles-available/`, `/api/admin/vehicles/<id>/unavailable-dates/`).
- [ ] `FinanceSummaryScreen`: `GET /api/admin/finance-summary/`.
- [ ] `/api/admin/dashboard/` for an at-a-glance home tab.
- [ ] `/api/admin/availability/` overlay on the calendar.

## Driver flows (skipped in v1)
- [ ] `BlockedDatesScreen`: list + add (date picker + reason) + delete.
- [ ] `PaymentSummaryScreen`: date-range picker, query
      `GET /api/driver/payment-summary/?start_date=&end_date=`.
- [ ] Trip actions (mark started/completed) once the backend exposes them.

## Polish
- [ ] Replace placeholder `assets/*.png` files (icon, splash, adaptive icon,
      notification icon, favicon) — Expo will fail to start without them.
- [ ] Tab icons (currently text-only labels).
- [ ] Visual styling pass on cards, spacing, empty states.
- [ ] Form validation + better error toasts.
- [ ] Offline handling / cached schedule for drivers.

## Build / release
- [ ] Confirm `expo start` boots and Expo Go connects.
- [ ] Set up EAS Build profiles in `eas.json`.
- [ ] Wire CI for typecheck + EAS preview builds.
