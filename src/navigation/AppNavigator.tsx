import React, { useEffect, useRef } from "react";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { ActivityIndicator, View } from "react-native";
import LoginScreen from "@/screens/LoginScreen";
import BookingDetailScreen from "@/screens/BookingDetailScreen";
import NewBookingScreen from "@/screens/NewBookingScreen";
import VehicleDetailScreen from "@/screens/VehicleDetailScreen";
import VehicleEditScreen from "@/screens/VehicleEditScreen";
import VehicleSearchScreen from "@/screens/VehicleSearchScreen";
import BookingCalendarScreen from "@/screens/BookingCalendarScreen";
import BookingGroupDetailScreen from "@/screens/BookingGroupDetailScreen";
import InboxConversationScreen from "@/screens/InboxConversationScreen";
import MailbotSettingsScreen from "@/screens/MailbotSettingsScreen";
import DriverListScreen from "@/screens/DriverListScreen";
import VillaDetailScreen from "@/screens/VillaDetailScreen";
import VillaEditScreen from "@/screens/VillaEditScreen";
import HotelDetailScreen from "@/screens/HotelDetailScreen";
import HotelEditScreen from "@/screens/HotelEditScreen";
import PackageEditScreen from "@/screens/PackageEditScreen";
import AdminTabs from "@/navigation/AdminTabs";
import DriverTabs from "@/navigation/DriverTabs";
import { useAuthStore } from "@/state/auth";
import { detectRole } from "@/api/auth";
import { setOnAuthFailure, tokenStorage } from "@/api/client";
import {
  extractBookingFromNotification,
  extractConversationFromNotification,
} from "@/utils/push";
import type { RootStackParamList } from "@/navigation/types";
import { colors, navTheme } from "@/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role);
  const signedIn = useAuthStore((s) => s.signedIn);
  const signedOut = useAuthStore((s) => s.signedOut);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  // On launch: if a refresh token exists, try to detect role and skip login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) {
        signedOut();
        return;
      }
      try {
        const { role: detected, driver } = await detectRole();
        if (!cancelled) signedIn(detected, driver);
      } catch {
        if (!cancelled) {
          await tokenStorage.clear();
          signedOut();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, signedOut]);

  // Wire interceptor → bounce to login on hard auth failure.
  useEffect(() => {
    setOnAuthFailure(() => {
      signedOut();
    });
    return () => setOnAuthFailure(null);
  }, [signedOut]);

  // Notification deep-link: open BookingDetail OR the Inbox conversation
  // depending on which id the notification carries. A Mailbot draft carries
  // conversation_id (and takes precedence — the operator lands where they
  // can approve). Booking reminders carry booking_id/booking_ref.
  useEffect(() => {
    function routeFromNotification(
      data: Notifications.NotificationContent["data"] | undefined
    ) {
      if (!navRef.current?.isReady()) return false;
      const conversation = extractConversationFromNotification(data);
      if (conversation) {
        navRef.current.navigate("InboxConversation", {
          conversationId: conversation.conversation_id,
        });
        return true;
      }
      const booking = extractBookingFromNotification(data);
      if (booking) {
        navRef.current.navigate("BookingDetail", {
          bookingId: booking.booking_id,
          bookingRef: booking.booking_ref,
        });
        return true;
      }
      return false;
    }

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        routeFromNotification(response.notification.request.content.data);
      }
    );
    // Cold-start tap: navigator may not be ready yet, poll briefly.
    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!last) return;
      const data = last.notification.request.content.data;
      const interval = setInterval(() => {
        if (routeFromNotification(data)) {
          clearInterval(interval);
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 5000);
    })();
    return () => sub.remove();
  }, []);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Tabs"
              component={role === "admin" ? AdminTabs : DriverTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="BookingDetail"
              component={BookingDetailScreen}
              options={{ title: "Booking" }}
            />
            <Stack.Screen
              name="BookingEdit"
              component={NewBookingScreen}
              options={{ title: "Edit Booking" }}
            />
            <Stack.Screen
              name="VehicleDetail"
              component={VehicleDetailScreen}
              options={{ title: "Vehicle" }}
            />
            <Stack.Screen
              name="VehicleEdit"
              component={VehicleEditScreen}
              options={{ title: "Edit Vehicle" }}
            />
            <Stack.Screen
              name="VehicleSearch"
              component={VehicleSearchScreen}
              options={{ title: "Find Vehicles" }}
            />
            <Stack.Screen
              name="BookingCalendar"
              component={BookingCalendarScreen}
              options={{ title: "Calendar" }}
            />
            <Stack.Screen
              name="BookingGroupDetail"
              component={BookingGroupDetailScreen}
              options={{ title: "Proposal" }}
            />
            <Stack.Screen
              name="InboxConversation"
              component={InboxConversationScreen}
              options={{ title: "Conversation" }}
            />
            <Stack.Screen
              name="MailbotSettings"
              component={MailbotSettingsScreen}
              options={{ title: "Mailbot" }}
            />
            <Stack.Screen
              name="DriverList"
              component={DriverListScreen}
              options={{ title: "Drivers" }}
            />
            <Stack.Screen
              name="VillaDetail"
              component={VillaDetailScreen}
              options={{ title: "Villa" }}
            />
            <Stack.Screen
              name="VillaEdit"
              component={VillaEditScreen}
              options={{ title: "Edit Villa" }}
            />
            <Stack.Screen
              name="HotelDetail"
              component={HotelDetailScreen}
              options={{ title: "Hotel" }}
            />
            <Stack.Screen
              name="HotelEdit"
              component={HotelEditScreen}
              options={{ title: "Edit Hotel" }}
            />
            <Stack.Screen
              name="PackageEdit"
              component={PackageEditScreen}
              options={{ title: "Edit Package" }}
            />
            <Stack.Screen
              name="NewBooking"
              component={NewBookingScreen}
              options={{ title: "New Booking" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
