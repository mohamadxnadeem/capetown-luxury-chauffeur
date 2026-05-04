# Capetown Luxury Chauffeur — mobile app

Expo (React Native + TypeScript) admin/driver app for the Capetown Luxury
Chauffeur Django backend.

## v1 status

End-to-end auth, role detection, push registration, calendar (role-aware),
booking detail (read-only), and notification deep-linking. Admin CRUD screens
and several driver self-service screens are stubbed — see `TODO.md`.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. In `app.json` set:
   - `expo.extra.apiBaseUrl` → your Railway URL.
   - `expo.extra.eas.projectId` → your EAS project id (required for push tokens).

3. Drop placeholder PNGs into `assets/`:
   - `icon.png` (1024×1024)
   - `splash.png`
   - `adaptive-icon.png`
   - `notification-icon.png`
   - `favicon.png`

4. Run:

   ```
   npm start
   ```

   Open in Expo Go (scan the QR). Push tokens only work on a real device.

## Verifying API shapes

The types in `src/api/types.ts` are best-effort guesses based on endpoint
names. Once the API URL is set, hit each endpoint with `curl` and replace the
guessed fields. The `[key: string]: unknown` escape hatches make it safe to
ship before that pass, but remove them as you verify shapes.

## Project layout

```
src/
  api/         axios client + endpoint wrappers + types
  hooks/       react-query hooks
  navigation/  stack + admin/driver bottom-tabs
  screens/     LoginScreen, CalendarScreen, BookingDetailScreen, ProfileScreen, Placeholders
  state/       zustand auth store
  utils/       push-notification helpers
  App.tsx      Providers (Paper, SafeArea, QueryClient) + navigator
```

## Auth flow

1. `POST /api/users/login/` → `{ access, refresh }` saved in `expo-secure-store`.
2. `GET /api/driver/me/` → 200 = driver, 404 = admin.
3. If driver, request notification permissions and
   `POST /api/driver/me/push-token/`.
4. axios attaches `Authorization: Bearer <access>`. On 401, it tries
   `POST /api/users/token/refresh/` once; if that fails the user is bounced to
   the login screen.
