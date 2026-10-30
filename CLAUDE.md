# Cape Town Concierge Mobile App

Brief for the App agent. You are maintaining this app without seeing
the chat history that built it. Read this first.

## 1. What the app is

Native mobile app (iOS + Android) for Cape Town Concierge, a Cape
Town based luxury chauffeur and tour business. The business trades
as Cape Town Concierge but the legal entity is Why Cape Town (Pty)
Ltd, Reg No. 2025/064751/07.

Three user types share one codebase. Role is detected at login and
determines which bottom tab navigator is shown.

**Admin / owner (Zaid).** Primary user. Signs in with Django
credentials. Uses the app to run the whole operation:

- See upcoming trips and daily schedule
- Create and edit bookings (single vehicle)
- Create multi-vehicle group bookings (one invoice, one client link
  covering several vehicles over several dates)
- Browse the vehicle fleet, villas, hotels, package tours
- Open the Mailbot Inbox to review and approve AI drafted replies
  to inbound client email and WhatsApp messages
- Open the voice assistant (mic button on Home) to ask spoken
  questions about bookings, earnings and drafts
- Share booking confirmation links and payment links with clients
  via WhatsApp or email
- Download PDF invoices to send to clients
- Manage drivers, blocked dates, finance totals
- Subscribe their personal phone Calendar app to an iCal feed of
  every fleet booking

**Driver.** Signs in with their own Django credentials. Sees their
assigned trips, marks days as complete, sees their payment summary,
blocks dates when unavailable.

**Client.** Does NOT use this app. Clients receive WhatsApp or email
links that open a public page on the marketing site (Next.js, a
separate codebase at `capetown-concierge.co.za`). The app surfaces
those links for the operator to forward.

## 2. Stack

- **Framework:** Expo SDK 54, React Native 0.81.5, TypeScript strict
- **App version:** 0.3.0 (from `app.json`). `runtimeVersion.policy`
  is `appVersion` so bumping `app.json` version creates a new OTA
  runtime target
- **Navigation:** @react-navigation/native 6.1 with
  @react-navigation/native-stack and @react-navigation/bottom-tabs
- **Server state:** @tanstack/react-query 5.59. QueryClient defaults
  live in `src/App.tsx`: retry 1, retryDelay 1000ms, staleTime 30s,
  gcTime 5 min
- **Local state:** zustand 4.5 for the auth store at
  `src/state/auth.ts`
- **HTTP:** axios 1.7 with interceptors in `src/api/client.ts` that
  attach the JWT access token and transparently refresh on 401
- **UI kit:** react-native-paper 5.12 for Buttons, Cards, TextInput,
  Menu, IconButton, ActivityIndicator, FAB
- **Calendar widget:** react-native-calendars 1.1306
- **Linear gradient:** expo-linear-gradient 15 for the emerald hero
  gradients
- **Secure storage:** expo-secure-store 15 for JWT tokens and
  persisted role
- **Push:** expo-notifications 0.32 with Expo Push tokens
- **Voice input:** expo-speech-recognition 58 (on-device STT, free,
  requires microphone and speech recognition permissions)
- **Voice output:** expo-speech 14 (on-device TTS, free). Prefers
  the Daniel voice on iOS for a British male voice. The screen
  queries `Speech.getAvailableVoicesAsync()` and picks the best
  match at runtime
- **Clipboard:** expo-clipboard 8 for copying share URLs
- **Image picker:** expo-image-picker 17 for vehicle, villa, hotel,
  package photo uploads
- **OTA:** expo-updates 29 wired to EAS Update

## 3. Map of the code

Entry point is `index.ts` which registers `src/App.tsx`. App.tsx
wraps the tree in QueryClientProvider, PaperProvider,
SafeAreaProvider and renders `AppNavigator`.

### src/api/

API layer. One file per backend domain. Each file exports plain
async functions returning parsed response data. These are called by
hooks, never from components directly.

- `client.ts` axios instance plus `tokenStorage` (SecureStore
  wrapper for access, refresh and role keys), `apiBaseUrl`,
  `setOnAuthFailure`, `proactiveRefresh`. Request interceptor
  attaches `Authorization: Bearer <access>`. Response interceptor
  catches 401 and runs a single-flight refresh via
  `/api/users/token/refresh/`, then retries the original request
  once; a second 401 bails to login.
- `auth.ts` login, logout, detectRole, registerPushToken
- `types.ts` the single source of truth for all shared interfaces.
  Includes `bookingDateRange(b)` helper which falls back from
  `b.days[]` to `b.start_date`/`b.end_date` to
  `b.accommodation_segments[]`
- `urls.ts` client-facing URL builders. `bookingDetailUrl` for a
  single booking, `driverBookingPageUrl` for the driver portal,
  `bookingGroupProposalUrl` for a group proposal page
- `errors.ts` `formatApiError(err)` that extracts a human readable
  string from axios errors
- `bookings.ts` admin booking CRUD, booking form options,
  vehicles-available, per-vehicle unavailable dates and booked slots,
  driver schedule, driver trip detail
- `bookingGroups.ts` CRUD for multi-vehicle BookingGroup, plus
  `convertBookingToGroup` which promotes an existing standalone
  booking into a group
- `vehicles.ts` admin vehicle CRUD, calendar token rotate
- `drivers.ts` admin driver CRUD
- `villas.ts`, `hotels.ts`, `packages.ts`, `experiences.ts` CRUD
  for accommodation and tour products
- `inbox.ts` Mailbot inbox: list conversations, read conversation,
  approve or reject an AgentAction, operator reply, handoff, link
  booking, kill switch, status
- `assistant.ts` voice assistant chat endpoint, conversation list,
  conversation detail, delete
- `calendar.ts` personal iCal feed token read and rotate
- `finance.ts` finance summary and graphs

### src/hooks/

React Query hooks mirroring the API layer. Query keys follow the
pattern `["admin", "<domain>", ...params]` or `["driver", ...]`.
Mutations invalidate related queries via `useQueryClient`. One hook
file per API domain. The important invalidation chain lives in
`useBookingGroups.ts` `invalidateGroupCaches()` which refreshes
groups list, group detail, bookings list and vehicle availability
after any group mutation.

### src/components/

Reusable UI, no business logic:

- `AddVehicleSheet.tsx` the shared modal that collects a new
  vehicle entry for both the convert-to-group flow (from a
  standalone booking) and the add-to-group flow (from an existing
  group). Includes an inline calendar for per-vehicle date
  selection
- `DayScheduleBar.tsx` horizontal 00:00 to 24:00 timeline bar used
  on booking details. Supports `endNextDay` (block runs off the
  right edge) and `morningTailEndTime` (translucent block at the
  left edge for a shift carrying over from the previous day)
- `ShimmerImage.tsx` image with placeholder shimmer during load,
  with a fallback slot
- `PhotoCarousel.tsx` cover photo swipe strip
- `ChipListInput.tsx` tag-style multi-value text input
- `DayBookingsTimeline.tsx` stacked trips on the calendar day view
- `FinanceGraphs.tsx` chart tiles for FinanceScreen

### src/screens/

One file per screen. Grouped roughly by domain:

- `LoginScreen.tsx` username + password, calls `login()`
- `HomeScreen.tsx` admin home. Hero, Calendar tile, "Upcoming
  this week" section, bookings list with status filter chips,
  mic FAB for the voice assistant, "+" FAB for new booking
- `NewBookingScreen.tsx` single screen that serves both the Create
  Booking and Edit Booking flows (distinguished by whether
  `route.params.bookingId` is set). Includes "Additional vehicles"
  section that turns the save into a BookingGroup create
- `BookingDetailScreen.tsx` single booking detail. Hero, group
  chip when part of a group, Customer / Trip / Pricing cards,
  Schedule with per-day DayScheduleBar, Status chips, Manage
  booking actions (Mark as paid, "+ Add another vehicle", Edit,
  Cancel). Houses the AddVehicleSheet usage for the convert flow
- `BookingGroupDetailScreen.tsx` group booking detail (CTC-GRP-*).
  Share proposal, Copy link, Send on WhatsApp, Confirm (generate
  Yoco), Cancel group, Rename booking (inline modal), + Add
  vehicle (uses AddVehicleSheet)
- `BookingGroupListScreen.tsx` lives in the "Groups" bottom tab.
  Lists every multi-vehicle group with filter chips. Exports
  `cleanGroupTitle(title, customerName)` helper that rewrites
  legacy "N-vehicle proposal for X" titles at display time
- `BookingCalendarScreen.tsx` month calendar with dots per booking
  day. Overnight shifts (end_next_day) drop a dot on BOTH the
  booking's date AND the next calendar day
- `VehicleListScreen.tsx`, `VehicleDetailScreen.tsx`,
  `VehicleEditScreen.tsx`, `VehicleSearchScreen.tsx` fleet
  management and availability search
- `VillaListScreen.tsx`, `VillaDetailScreen.tsx`,
  `VillaEditScreen.tsx` villa management
- `HotelListScreen.tsx`, `HotelDetailScreen.tsx`,
  `HotelEditScreen.tsx` hotel management
- `PackageListScreen.tsx`, `PackageEditScreen.tsx` tour packages
- `AccommodationScreen.tsx` the "Stays" tab with a top toggle
  between villas and hotels
- `InboxListScreen.tsx` Mailbot inbox tab. Filter chips All /
  Pending / Human-only / Archived. Gear icon in the header opens
  MailbotSettings
- `InboxConversationScreen.tsx` thread view with pending AgentAction
  cards (approve edited text or reject), WhatsApp-style message
  bubbles, operator reply composer, hand off button
- `MailbotSettingsScreen.tsx` kill switch, Gmail connected status,
  Gmail watch expiry, drafts pending count, help copy
- `AssistantScreen.tsx` modal voice chat. Live transcript overlay
  while recording, chat log with user and assistant bubbles, big
  mic button, text input fallback, example chips when empty.
  expo-speech plays the agent's replies aloud
- `FinanceScreen.tsx` revenue summary, graphs
- `DriverListScreen.tsx` driver management
- `ProfileScreen.tsx` sign out, Drivers nav row, Packages nav row,
  Personal calendar feed card (enable, copy, open in Calendar,
  rotate)
- `CalendarScreen.tsx` driver's schedule screen
- `Placeholders.tsx` stub screens

### src/navigation/

- `types.ts` TypeScript types for every stack and tab route plus
  their params
- `AppNavigator.tsx` native stack navigator at the top. Mounts
  Login when not authenticated, otherwise mounts the Tabs plus
  the detail-level stack screens (BookingDetail, BookingEdit,
  VehicleDetail, VehicleEdit, VehicleSearch, BookingCalendar,
  BookingGroupDetail, InboxConversation, MailbotSettings,
  Assistant, DriverList, VillaDetail, VillaEdit, HotelDetail,
  HotelEdit, PackageList, PackageEdit, NewBooking). Also owns the
  cold-start bootstrap (`detectRole()`), the push notification
  deep-link handler and the hard auth failure handler
- `AdminTabs.tsx` admin bottom tabs: Home, Inbox (with pending
  draft badge from `useInboxConversations`), Finance, Vehicles,
  Accommodation ("Stays"), Groups, Profile
- `DriverTabs.tsx` driver bottom tabs: Schedule, Blocked, Payments,
  Profile

### src/state/

- `auth.ts` zustand store with `isAuthenticated`, `role`, `driver`,
  `bootstrapping`, `signedIn()`, `signedOut()`

### src/utils/

- `push.ts` `registerForPushNotificationsAsync()` which asks for
  permissions, sets up the Android notification channel and fetches
  the Expo push token. Also `extractBookingFromNotification()` and
  `extractConversationFromNotification()` which the AppNavigator
  deep-link handler uses to route notification taps

### src/theme/

- `index.ts` palette (primary emerald `#0b5b33`, primaryDark,
  background, surface, surfaceMuted, border, text, heading, muted,
  onPrimary, bookedBg, bookedText, partialBg, partialText),
  `gradientPrimary` tuple, `calendarTheme`, `navTheme`

## 4. Backend connection

### API base URL

Read from `expo.extra.apiBaseUrl` in `app.json`. Current value:
`https://web-production-1ab9.up.railway.app`. The backend is a
Django app on Railway at that domain, maintained by a separate
Claude session (do not touch it; see section 8).

Related config in `app.json` extras:

- `clientBookingBaseUrl` the marketing site domain for client
  facing confirmation links (`https://www.capetown-concierge.co.za`)
- `driverBookingBaseUrl` driver portal base URL

### Login and JWT tokens

Login flow in `src/api/auth.ts`:

1. `login(username, password)` POSTs to `/api/users/login/` with
   JSON body `{ username, password }`
2. Response is a `LoginResponse` containing `access`, `refresh`,
   plus user info and `isAdmin`
3. Tokens persist to SecureStore via `tokenStorage.set(access,
   refresh)`
4. Role persists via `tokenStorage.setRole("admin" | "driver")`
   based on `isAdmin`

Token refresh in `src/api/client.ts`:

1. Request interceptor reads `tokenStorage.getAccess()` and attaches
   `Authorization: Bearer <access>`
2. Response interceptor catches 401, triggers a single-flight
   refresh at `/api/users/token/refresh/` with body `{ refresh }`,
   stores new tokens (backend rotates refresh tokens too), retries
   the original request once
3. If the refresh itself 401s or returns no access token, bails to
   login via `onAuthFailure` callback (wired from `AppNavigator`)

Proactive refresh runs on every cold start before the first API
call, extending the session as long as the operator opens the app
at least once per refresh-token lifetime window.

Cold start bootstrap in `AppNavigator`:

1. Check for a stored refresh token
2. If present, call `proactiveRefresh()` (best effort)
3. Call `detectRole()` which reads the stored role, or probes
   `/api/driver/me/` on legacy sessions (404 => admin)
4. If detectRole throws, clear tokens and sign out

### Every backend endpoint called

Admin endpoints require admin JWT; driver endpoints require driver
JWT. All documented methods are what the app sends, not every
method the backend supports.

**Auth:**

- POST `/api/users/login/`
- POST `/api/users/token/refresh/` (via the client interceptor)

**Admin: bookings and groups:**

- GET  `/api/admin/bookings/` (query: status, driver, car,
  start_date, end_date, customer, booking_reference, is_multi_day)
- GET  `/api/admin/bookings/<id>/`
- POST `/api/admin/bookings/create/`
- PATCH `/api/admin/bookings/<id>/update/`
- DELETE `/api/admin/bookings/<id>/delete/`
- POST `/api/admin/bookings/<id>/convert-to-group/`
- GET  `/api/admin/booking-form-options/`
- GET  `/api/admin/vehicles-available/` (query: start_date,
  end_date)
- GET  `/api/admin/vehicles/<id>/unavailable-dates/` (query:
  start_date, end_date)
- GET  `/api/admin/vehicles/<id>/booked-slots/` (query: start_date,
  end_date)
- GET  `/api/admin/booking-groups/`
- GET  `/api/admin/booking-groups/<id>/`
- POST `/api/admin/booking-groups/create/`
- PATCH `/api/admin/booking-groups/<id>/update/`
- POST `/api/admin/booking-groups/<id>/add-booking/`
- POST `/api/admin/booking-groups/<id>/remove-booking/<booking_id>/`
  (query: delete=true|false)
- POST `/api/admin/booking-groups/<id>/confirm/`
- POST `/api/admin/booking-groups/<id>/cancel/`

**Admin: vehicles:**

- GET  `/api/admin/vehicles/` (query: is_public, is_active, category,
  driver, search)
- GET  `/api/admin/vehicles/<id>/`
- POST `/api/admin/vehicles/create/`
- PATCH `/api/admin/vehicles/<id>/update/`
- DELETE `/api/admin/vehicles/<id>/delete/`
- POST `/api/admin/vehicles/<id>/calendar-token/rotate/`

**Admin: drivers:**

- GET  `/api/admin/drivers/`
- GET  `/api/admin/drivers/<id>/`
- POST `/api/admin/drivers/create/`
- PATCH `/api/admin/drivers/<id>/update/`
- DELETE `/api/admin/drivers/<id>/delete/`

**Admin: villas / hotels / packages / experiences:**

- GET  `/api/admin/villas/` (and `/<id>/`, `/create/`, `/update/`,
  `/delete/`)
- GET  `/api/admin/hotels/` (same shape)
- GET  `/api/admin/packages/` (same shape)
- GET  `/api/experiences/all/` (public listing)

**Admin: finance:**

- GET  `/api/admin/finance-summary/`

**Admin: mailbot inbox:**

- GET  `/api/admin/inbox/` (query: offset, limit)
- GET  `/api/admin/inbox/<conversation_id>/`
- POST `/api/admin/inbox/<conv>/approve/<action>/` (body:
  `{ edited_text? }`)
- POST `/api/admin/inbox/<conv>/reject/<action>/`
- POST `/api/admin/inbox/<conv>/reply/` (body: `{ text }`)
- POST `/api/admin/inbox/<conv>/handoff/`
- POST `/api/admin/inbox/<conv>/link-booking/` (body:
  `{ booking_id }`)
- POST `/api/admin/mailbot/kill-switch/` (body: `{ enabled }`)
- GET  `/api/admin/mailbot/status/`

**Admin: voice assistant** (endpoint built by backend Claude in
parallel to the mobile side):

- POST `/api/admin/assistant/chat/` (body: `{ message,
  conversation_id? }`)
- GET  `/api/admin/assistant/conversations/`
- GET  `/api/admin/assistant/conversations/<id>/`
- DELETE `/api/admin/assistant/conversations/<id>/`

**Admin: calendar feed:**

- GET  `/api/admin/calendar-token/`
- POST `/api/admin/calendar-token/rotate/`

**Driver:**

- GET  `/api/driver/me/`
- GET  `/api/driver/schedule/`
- GET  `/api/driver/trips/<booking_ref>/`
- GET  `/api/driver/payment-summary/`
- GET  `/api/driver/blocked-dates/`
- POST `/api/driver/blocked-dates/`
- DELETE `/api/driver/blocked-dates/<id>/`

**Push token registration:**

- POST `/api/admin/push-token/` (body: `{ expo_push_token }`)
- POST `/api/driver/me/push-token/` (body: `{ expo_push_token }`)
- DELETE `/api/admin/push-token/` (on admin logout)
- DELETE `/api/driver/me/push-token/` (on driver logout)

### Push notifications

Permission + token fetch happens in `src/utils/push.ts`
`registerForPushNotificationsAsync()`. The EAS project ID is read
from `Constants.expoConfig?.extra?.eas?.projectId`.

On login (admin or driver), `registerPushToken(expoPushToken)` in
`src/api/auth.ts` POSTs to the role-appropriate endpoint. On logout
it DELETEs. The deep-link handler in `AppNavigator` routes taps on
notifications carrying `conversation_id` to InboxConversation, and
taps carrying `booking_id` or `booking_ref` to BookingDetail.
Payload field names supported: snake_case preferred, camelCase as
fallback.

## 5. How to run, test and build

### Local development

```
npx expo start                  # starts the dev server
npx expo start --dev-client     # if you have a dev build installed
```

Prerequisite: a dev build installed on your test device (not Expo
Go) because the project uses `expo-notifications`, `expo-secure-store`
and `expo-speech-recognition` which are native modules. The current
Expo Go version is also usually mismatched to this app's SDK.

### Type check

```
npx tsc --noEmit
```

Must pass before every PR. There is no lint config in the repo
beyond TypeScript strict mode.

### OTA update (JS and asset changes only)

```
eas update --branch production --message "<short description>"
```

OTA is keyed to `runtimeVersion`, which (via policy `appVersion`)
tracks `app.json`'s `version` field. If you only change JS or
assets, an OTA reaches every installed device on the matching
version. Operator cold-starts the app twice to pull and run the
update.

### New native build (when native code or deps change)

```
eas build --profile production --platform ios       # TestFlight
eas build --profile production --platform android   # Play internal
```

Needed when: adding or removing a native module, changing an Expo
config plugin, changing an iOS entitlement or `Info.plist` key,
changing `app.json`'s `version`. Build takes 10 to 15 minutes in
the EAS cloud. iOS auto-submits to TestFlight if `eas.json`'s
production profile has submit config.

### Environment variables (names only)

The mobile app reads config from `app.json`'s `expo.extra`. The
Django backend reads a separate set of env vars on Railway. Mobile
should never need backend secrets.

**Mobile side** (in `app.json` `expo.extra`):

- `apiBaseUrl`
- `clientBookingBaseUrl`
- `driverBookingBaseUrl`
- `eas.projectId`

**Backend side** (Railway, listed for context only; do not read or
write):

- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ACCOUNT_EMAIL`,
  `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `WHATSAPP_APP_SECRET`
- plus the Django and Yoco keys

### Release flow

1. Open a PR on branch `agent/<task>` (see section 7)
2. Operator merges after review
3. For JS-only changes: `eas update --branch production` on
   whichever branch is now main. Live within minutes
4. For native changes: `eas build` then TestFlight / Play. Operator
   installs the new build. From then on OTAs again reach it

## 6. Decisions and gotchas

Things a new developer could break by accident. Read them.

### Secrets handling

Never paste secret values into chat, into source files, into git
commits, or into any Claude agent conversation. API keys, OAuth
client secrets, push tokens, verify tokens, access tokens all live
in Railway env vars or in SecureStore. If you need to reference one,
reference it by name, never by value.

### Timezone

South Africa Standard Time is UTC+2 and does not observe DST.
Never use `new Date().toISOString().slice(0, 10)` to get "today"
because that returns UTC which lands on yesterday after local
midnight. Use the `isoLocal(d)` helper in `HomeScreen.tsx` and
`BookingCalendarScreen.tsx`:

```ts
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

### OTA versus native build

A JS change is NOT enough when you add a new native module,
change a config plugin, change `Info.plist`, change
`AndroidManifest.xml`, change an Expo config plugin's options, or
bump `app.json`'s version. In those cases operator must install a
new EAS build before the change is live. OTAs targeted at the
new runtimeVersion will not reach older installed builds.

### Group chip gating

The "Part of a group booking" chip and the inverse "+ Add another
vehicle" button check BOTH `booking.group_id` AND
`booking.group_reference`. Stale cache can leave one populated and
the other missing. See `BookingDetailScreen.tsx`. If you only check
one you will show the +Add button on an already-grouped booking,
and tapping it will fail with "already in group" from the backend.

### Overnight shifts

A `BookingDay` with `end_next_day: true` means `end_time` falls on
the calendar day AFTER `date`. Example 21:00 to 02:00 crosses
midnight. Validation: `end_next_day=true` requires
`end_time < start_time`. Auto-detected on write in
`NewBookingScreen.tsx` via `isOvernightShift(startTime, endTime)`
helper. On display, the `DayScheduleBar` runs its block off the
right edge of the primary day's bar and renders a translucent
"morning tail" on the following day's bar. The Calendar tab also
drops dots on both dates. If a booking lives on Oct 7 only but
has `end_next_day: true`, the next calendar day's availability is
also busy until `end_time`.

### Upcoming trips rendering

The Home screen's "Upcoming this week" shows ONE row per booking
anchored at that booking's earliest day STRICTLY AFTER today,
within a 7-day horizon. Today is intentionally excluded. Changing
this filter affects what the operator notices in the morning.
Changing to `>= today` would re-introduce the behavior where
today's trips crowd the section even though they are already in
flight.

### Mailbot drafts are DRAFT ONLY

Everything the AI mailbot produces (reply drafts, booking drafts)
is DRAFT ONLY. Nothing is ever sent or committed to a client until
the operator approves it from InboxConversationScreen. Do NOT add
an auto-send path. The voice assistant follows the same rule: Phase
1 is READ-ONLY (answers only, cannot act). If future phases add
drafting via voice, they also go through the operator approval
flow in the Inbox.

### Multiple pending drafts in one conversation

Backend upserts drafts: if a client sends 3 messages back-to-back,
you get ONE pending draft that updates in place, not three. If a
new mobile call creates duplicate pending drafts, the backend has
regressed; do not work around it on mobile.

### Group booking legacy titles

Older groups have titles like "2-vehicle proposal for Alex" baked
into the database from the first auto-generation default. The
mobile side displays them through `cleanGroupTitle(title,
customerName)` exported from `BookingGroupListScreen.tsx` which
rewrites them to "Trip for X" at render time. The stored value is
unchanged. The operator can permanently rename via the "Rename
booking" button on the group screen.

### DRF endpoint auth

Most admin endpoints are DRF views that only accept JWT in the
`Authorization` header. Two exceptions are the Gmail OAuth
redirects (`/api/mailbot/gmail/connect/` and
`/api/mailbot/gmail/oauth-callback/`) which are plain Django views
with `@staff_member_required` because they are browser-driven. If
you hit a 403 "Authentication credentials were not provided" from
a browser visit, that endpoint is DRF JWT-only; it is NOT meant to
be visited directly.

### Gmail watch renewal

Gmail Push watches expire every 7 days (Google rule, cannot be
disabled). The backend is set up with layered renewal (in-process
scheduler, startup hook, status-check hook). If the mobile Mailbot
Settings status shows "Gmail watch: expired", the renewal cron
failed; operator or backend agent needs to re-run
`python manage.py renew_gmail_watch` on Railway or re-authorize
via `/api/mailbot/gmail/connect/` in a browser.

### Yoco payment links

Grouped bookings have ONE payment link on the group, not per child.
Child bookings in a group should NEVER display their own payment
link. If `booking.payment_link` is null on a child, that is correct;
read `group.payment_link` instead via the group detail endpoint.

### Share URLs

Group proposal URL pattern: `${clientBaseUrl}/proposal/<group_ref>`.
Single booking confirmation: `${clientBaseUrl}/booking/<ref>`.
Driver trip page: `${clientBaseUrl}/driver/<ref>`. These URLs point
at the Next.js marketing site (a different repo). Changing a path
here breaks any links already sent to clients.

### Backend serializer dependencies

The Calendar tab in the mobile app depends on the admin bookings
list serializer including `days[]`. Previously it omitted days[]
and the mobile bucketing code fell back to filling in the entire
booking date range (wrong when a booking has non-contiguous days).
If you see the Calendar lighting up every date between a non-
contiguous booking's first and last day again, backend has regressed
on including days[] in the list payload.

### Voice assistant native build

The voice assistant (`AssistantScreen.tsx`) requires
`expo-speech-recognition` and `expo-speech`. These are native
modules; an OTA alone will not deliver them to a build that lacks
them. If an operator reports the AssistantScreen crashing on open
or the mic button doing nothing, verify they are on a build >= 0.3.0
(the version bump that added these modules).

## 7. How to work

- Never commit to `main`. Always open a PR from a branch named
  `agent/<task>`, for example `agent/invoice-screen` or
  `agent/fix-upcoming-filter`
- Run `npx tsc --noEmit` before opening a PR. It must pass clean.
  There is no linter beyond strict TypeScript
- Keep commits focused. One logical change per commit. A rename
  PR, a feature PR, and a fix PR are three PRs
- Match the existing style: no emoji in files unless already in a
  nearby line, no multi-line docstrings, short "why" comments only
  when the reader could not figure it out from identifiers alone
- Never change the app signing identity, bundle identifier
  (`za.co.capetown-concierge` iOS, `za.co.capetownconcierge`
  Android), App Store / Play Store listings, screenshots, or push
  notification credentials. Those are tied to the business's
  developer accounts and existing published builds
- Never change `expo.extra.eas.projectId` or
  `expo.updates.url` in `app.json`. They tie this codebase to its
  live EAS project
- When bumping the `app.json` version (e.g. for new native modules),
  bump BOTH `ios.buildNumber` AND `android.versionCode` too so
  store submissions do not conflict with previous uploads
- Never add em dashes to any file. Use regular hyphens, commas,
  colons or parentheses

## 8. Never

- Commit secrets of any kind: API keys, JWT tokens, OAuth client
  secrets, push verify tokens, S3 keys, bank or payment details
- Edit the Django backend repo. That is a separate codebase on
  Railway maintained by its own Claude session. When the mobile
  app needs a new or changed endpoint, write a prompt for backend
  Claude; do not try to patch the backend from this repo
- Edit the Next.js marketing site repo (`capetown-concierge.co.za`).
  Same reason, separate codebase
- Call `--no-verify` on commits or push with hooks disabled
- Force-push to `main`
- Delete tags or published EAS Update branches
- Upload production builds to the stores from a dev machine without
  the operator explicitly asking. Builds happen via `eas build`
  which uses stored credentials; store submission is operator-driven

## 9. Latest updates

Newest first. Add new entries at the top with the date in ISO
format.

### 2026-10-30

- Added CLAUDE.md (this file)
- Began Phase 1 voice assistant: `AssistantScreen`, mic FAB on
  Home, `expo-speech` + `expo-speech-recognition` installed, app
  version bumped 0.2.0 to 0.3.0 (new native build required).
  Backend endpoint `/api/admin/assistant/chat/` in flight
- Combined backend prompt sent to backend Claude for voice
  assistant endpoint + full invoice generation system (PDF via
  WeasyPrint, Invoice model, numbered CTC-INV-NNNN per year)

### 2026-10-29

- Inline "Rename booking" modal on `BookingGroupDetailScreen`
  (persists title via PATCH `/update/`)
- Display helper `cleanGroupTitle` rewrites legacy "N-vehicle
  proposal for X" strings at render time without touching the DB
- Renamed every user-facing "proposal" string to "booking" or
  "trip" across the mobile UI (hero titles, share messages,
  section labels, alerts, nav title)
- Replaced the Packages bottom tab with a dedicated Groups tab
  that opens `BookingGroupListScreen`. Packages still reachable
  via a new nav row on `ProfileScreen`
- Shared `AddVehicleSheet` component extracted to
  `src/components/`, now used by both the convert-to-group flow
  (BookingDetail) and the add-to-group flow (BookingGroupDetail).
  Inline calendar for per-vehicle date selection
- Gmail watch renewal prompt sent to backend Claude (three-layer:
  in-process scheduler + startup hook + status-check hook)

### 2026-10-07 to 2026-10-08

- Overnight booking support shipped end-to-end: `end_next_day`
  field on `BookingDay`, auto-detection in NewBookingScreen when
  end_time < start_time, 🌙 OVERNIGHT badge on BookingDetail,
  `DayScheduleBar` renders overnight shifts across two day rows
  with a "morning tail" on the next date, Calendar tab also drops
  dots on both days
- "Upcoming this week" collapsed to one row per booking anchored
  at the earliest day strictly after today
- Backend `end_next_day` acceptance added to UPDATE serializer
  (originally shipped only on CREATE, caused a 400 on editing)
- `BookingCalendarScreen` buckets per-day using explicit `days[]`
  instead of filling the full date range (fixes dots lighting up
  on non-contiguous days)
- Allow past dates when creating a booking (removed calendar
  `minDate`)
- Proactive token refresh on cold start in `AppNavigator` to
  reduce "logged out after a few days" prompts

### 2026-10-01 to 2026-10-03

- Shipped multi-vehicle BookingGroup: types + API + hooks,
  `BookingGroupDetailScreen`, group chip on BookingDetail,
  `convert-to-group` flow with `AddVehicleSheet`
- Mailbot Inbox tab shipped (list + conversation detail +
  MailbotSettings), push deep-link handler routes
  `conversation_id` to InboxConversation
- Personal iCal feed card on Profile
- Gmail OAuth handshake completed, Pub/Sub topic + subscription
  configured, DNS SPF record updated to include `_spf.google.com`
  to fix outbound email deliverability
- Website footer updated with "Cape Town Concierge is a trading
  name of Why Cape Town (Pty) Ltd, Reg. No. 2025/064751/07"

### earlier

Initial scaffold of the Expo React Native admin + driver app.
Login, Home with bookings list, Vehicles CRUD, NewBookingScreen,
BookingDetailScreen, Villa + Hotel + Package management,
VehicleSearchScreen, Finance, Profile.
