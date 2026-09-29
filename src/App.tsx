import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppNavigator from "@/navigation/AppNavigator";
import { paperTheme } from "@/theme";

// Global defaults for every query / mutation.
//   - retry: 1     → one initial attempt + one retry = max 2 tries.
//   - retryDelay   → 1s backoff before the retry (avoid rehammering).
//   - staleTime    → 30s. Screens re-mounted within 30s render from cache
//                    instantly. Mutations invalidate the exact keys they
//                    touch, so post-edit re-fetches remain immediate.
//   - gcTime       → keep responses in memory for 5 min after the last
//                    consumer unmounts. Killing + re-opening the app to
//                    the same screen paints instantly from cache while a
//                    background refresh runs.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AppNavigator />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
