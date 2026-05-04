import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppNavigator from "@/navigation/AppNavigator";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <AppNavigator />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
