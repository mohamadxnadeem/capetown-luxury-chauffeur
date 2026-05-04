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
import AdminTabs from "@/navigation/AdminTabs";
import DriverTabs from "@/navigation/DriverTabs";
import { useAuthStore } from "@/state/auth";
import { detectRole } from "@/api/auth";
import { setOnAuthFailure, tokenStorage } from "@/api/client";
import { extractBookingFromNotification } from "@/utils/push";
import type { RootStackParamList } from "@/navigation/types";

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

  // Notification deep-link: open BookingDetail when the user taps a push.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = extractBookingFromNotification(
        response.notification.request.content.data
      );
      if (!payload) return;
      // Only navigate once we're past login — otherwise stash and let the next
      // mount handle it. Simple version: try-and-bail.
      if (!navRef.current?.isReady()) return;
      // Drivers identify trips by booking_ref; admins by booking_id.
      navRef.current.navigate("BookingDetail", {
        bookingId: payload.booking_id,
        bookingRef: payload.booking_ref,
      });
    });
    // Also handle the case where the app was launched cold from a tap.
    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!last) return;
      const payload = extractBookingFromNotification(
        last.notification.request.content.data
      );
      if (!payload) return;
      // Defer until navigator mounts.
      const interval = setInterval(() => {
        if (navRef.current?.isReady()) {
          navRef.current.navigate("BookingDetail", {
            bookingId: payload.booking_id,
            bookingRef: payload.booking_ref,
          });
          clearInterval(interval);
        }
      }, 100);
      // Give up after a few seconds.
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
    <NavigationContainer ref={navRef}>
      <Stack.Navigator>
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
