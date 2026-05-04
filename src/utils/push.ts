import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null; // Push tokens require a real device.
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    return null;
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId || projectId === "REPLACE_WITH_EAS_PROJECT_ID") {
    console.warn("[push] no EAS projectId configured in app.json; skipping token fetch");
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export interface BookingNotificationPayload {
  booking_id?: number | string;
  booking_ref?: string;
}

export function extractBookingFromNotification(
  data: Notifications.NotificationContent["data"] | undefined
): BookingNotificationPayload | null {
  if (!data) return null;
  const bookingId =
    (data as { booking_id?: number | string }).booking_id ??
    (data as { bookingId?: number | string }).bookingId;
  const bookingRef =
    (data as { booking_ref?: string }).booking_ref ??
    (data as { bookingRef?: string }).bookingRef;
  if (bookingId == null && !bookingRef) return null;
  return { booking_id: bookingId, booking_ref: bookingRef };
}
