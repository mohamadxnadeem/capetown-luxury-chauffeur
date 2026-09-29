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

// Push notifications carry either a booking pointer (reminders,
// draft bookings) OR a conversation pointer (Mailbot draft replies /
// escalations). We extract both here — the AppNavigator picks a route
// based on which one is populated (conversation wins if both, since it's
// the more actionable place for the operator to land).
export interface BookingNotificationPayload {
  booking_id?: number | string;
  booking_ref?: string;
}

export interface ConversationNotificationPayload {
  conversation_id: number;
  kind?: string;
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

export function extractConversationFromNotification(
  data: Notifications.NotificationContent["data"] | undefined
): ConversationNotificationPayload | null {
  if (!data) return null;
  const raw =
    (data as { conversation_id?: number | string }).conversation_id ??
    (data as { conversationId?: number | string }).conversationId;
  if (raw == null) return null;
  const id = typeof raw === "string" ? parseInt(raw, 10) : raw;
  if (isNaN(id)) return null;
  const kind = (data as { kind?: string }).kind;
  return { conversation_id: id, kind };
}
