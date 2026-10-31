import React, { useEffect, useRef, useState } from "react";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { ActivityIndicator, AppState, View } from "react-native";
import { Button, Text } from "react-native-paper";
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
import AssistantScreen from "@/screens/AssistantScreen";
import DriverListScreen from "@/screens/DriverListScreen";
import VillaDetailScreen from "@/screens/VillaDetailScreen";
import VillaEditScreen from "@/screens/VillaEditScreen";
import HotelDetailScreen from "@/screens/HotelDetailScreen";
import HotelEditScreen from "@/screens/HotelEditScreen";
import PackageEditScreen from "@/screens/PackageEditScreen";
import PackageListScreen from "@/screens/PackageListScreen";
import AdminTabs from "@/navigation/AdminTabs";
import DriverTabs from "@/navigation/DriverTabs";
import { useAuthStore } from "@/state/auth";
import { detectRole } from "@/api/auth";
import {
  proactiveRefresh,
  refreshIfStale,
  setOnAuthFailure,
  tokenStorage,
} from "@/api/client";
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

  // Shown only when a legacy session (no stored role) cannot reach the
  // server on launch. Tokens are kept; Retry runs the bootstrap again.
  const [bootError, setBootError] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);

  // On launch: stay signed in from stored tokens + role, even offline. Only
  // a refresh the server rejects (401/400) signs out. The refresh runs in
  // the background so an offline launch does not wait on a timeout, and it
  // rotates the refresh token so the session keeps extending with use.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) {
        signedOut();
        return;
      }
      const storedRole = await tokenStorage.getRole();
      if (cancelled) return;

      if (storedRole) {
        signedIn(storedRole, null);
        // Fire and forget. "invalid" signs out via onAuthFailure.
        void proactiveRefresh();
        if (storedRole === "driver") {
          // Driver profile is a nicety; detectRole degrades to null offline.
          const { driver } = await detectRole();
          if (!cancelled && driver && useAuthStore.getState().isAuthenticated) {
            signedIn("driver", driver);
          }
        }
        return;
      }

      // Legacy session with no stored role: needs the server to tell admin
      // from driver.
      const outcome = await proactiveRefresh();
      if (cancelled) return;
      if (outcome.status === "invalid") {
        signedOut();
        return;
      }
      try {
        const { role: detected, driver } = await detectRole();
        if (!cancelled) signedIn(detected, driver);
      } catch {
        if (cancelled) return;
        // If the interceptor found the session dead it already cleared the
        // tokens. Otherwise this is a network or server problem: keep the
        // tokens and offer a retry instead of signing out.
        if (!(await tokenStorage.getRefresh())) {
          signedOut();
        } else {
          setBootError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, signedOut, bootAttempt]);

  // Returning to the foreground: renew the access token if it is about to
  // lapse so the first tap does not 401.
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshIfStale();
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Wire interceptor: bounce to login when the session is definitely dead.
  useEffect(() => {
    setOnAuthFailure(() => {
      signedOut();
    });
    return () => setOnAuthFailure(null);
  }, [signedOut]);

  // Notification deep-link: open BookingDetail OR the Inbox conversation
  // depending on which id the notification carries. A Mailbot draft carries
  // conversation_id (and takes precedence: the operator lands where they
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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        }}
      >
        {bootError ? (
          <>
            <Text style={{ color: colors.heading, textAlign: "center" }}>
              Couldn't reach the server. Check your signal and try again.
            </Text>
            <Button
              mode="contained"
              buttonColor={colors.primary}
              onPress={() => {
                setBootError(false);
                setBootAttempt((n) => n + 1);
              }}
            >
              Retry
            </Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
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
              options={{ title: "Group booking" }}
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
              name="Assistant"
              component={AssistantScreen}
              options={{ headerShown: false, presentation: "modal" }}
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
              name="PackageList"
              component={PackageListScreen}
              options={{ title: "Packages" }}
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
