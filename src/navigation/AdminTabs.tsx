import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import FinanceScreen from "@/screens/FinanceScreen";
import HomeScreen from "@/screens/HomeScreen";
import InboxListScreen from "@/screens/InboxListScreen";
import BookingGroupListScreen from "@/screens/BookingGroupListScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import VehicleListScreen from "@/screens/VehicleListScreen";
import AccommodationScreen from "@/screens/AccommodationScreen";
import { useInboxConversations } from "@/hooks/useInbox";
import { colors } from "@/theme";
import type { AdminTabsParamList } from "@/navigation/types";

const Tab = createBottomTabNavigator<AdminTabsParamList>();

// Filled-when-focused / outline-when-not is the standard mobile pattern; the
// tint color comes from tabBarActive/InactiveTintColor so we just forward it.
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
function tabIcon(filled: IconName, outline: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <MaterialCommunityIcons
      name={focused ? filled : outline}
      size={24}
      color={color}
    />
  );
}

export default function AdminTabs() {
  // Show a badge on the Inbox tab when at least one draft is awaiting
  // approval. Uses the same 30s poll the Inbox screen relies on so the
  // badge stays fresh even on other tabs.
  const inboxQuery = useInboxConversations();
  const pendingDraftCount = (inboxQuery.data ?? []).reduce(
    (n, c) => n + c.pending_approval_count,
    0
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarIcon: tabIcon("home-variant", "home-variant-outline"),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxListScreen}
        options={{
          tabBarIcon: tabIcon("email", "email-outline"),
          tabBarBadge: pendingDraftCount > 0 ? pendingDraftCount : undefined,
        }}
      />
      <Tab.Screen
        name="Finance"
        component={FinanceScreen}
        options={{
          headerShown: false,
          tabBarIcon: tabIcon("chart-line", "chart-line-variant"),
        }}
      />
      <Tab.Screen
        name="Vehicles"
        component={VehicleListScreen}
        options={{ tabBarIcon: tabIcon("car", "car-outline") }}
      />
      <Tab.Screen
        name="Accommodation"
        component={AccommodationScreen}
        options={{
          headerShown: false,
          tabBarLabel: "Stays",
          tabBarIcon: tabIcon("bed", "bed-outline"),
        }}
      />
      <Tab.Screen
        name="Groups"
        component={BookingGroupListScreen}
        options={{
          headerShown: false,
          tabBarIcon: tabIcon("car-multiple", "car-multiple"),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: tabIcon("account-circle", "account-circle-outline"),
        }}
      />
    </Tab.Navigator>
  );
}
