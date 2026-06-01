import Constants from "expo-constants";
import { apiBaseUrl } from "./client";

// Where booking detail links point. We split client vs driver because they
// land on different things:
//
//  - Client links go to the marketing site (Next.js) which renders a polished
//    booking detail page + upsell tours. Configurable via
//    `expo.extra.clientBookingBaseUrl` in app.json.
//
//  - Driver links go to the Django backend's server-rendered driver portal
//    (/driver/trip/<ref>/). Configurable via
//    `expo.extra.driverBookingBaseUrl`; falls back to the API base.
const extra = Constants.expoConfig?.extra as
  | { clientBookingBaseUrl?: string; driverBookingBaseUrl?: string }
  | undefined;

const clientBaseUrl =
  extra?.clientBookingBaseUrl ?? "https://www.capetown-concierge.co.za";
const driverBaseUrl = extra?.driverBookingBaseUrl ?? apiBaseUrl;

export type LinkAudience = "client" | "driver";

export function bookingDetailUrl(
  bookingRef: string,
  audience: LinkAudience = "client"
): string {
  const base = audience === "driver" ? driverBaseUrl : clientBaseUrl;
  const path =
    audience === "driver"
      ? `/driver/trip/${bookingRef}/`
      : `/booking/${bookingRef}/`;
  return `${base}${path}`;
}

// Marketing-site driver-facing booking page. Lives on the same Next.js
// domain as the client page so the URL the driver opens in WhatsApp goes
// to the polished public site (not the Django admin portal).
export function driverBookingPageUrl(bookingRef: string): string {
  return `${clientBaseUrl}/driver/${bookingRef}/`;
}
