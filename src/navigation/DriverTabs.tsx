import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import CalendarScreen from "@/screens/CalendarScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { BlockedDatesScreen, PaymentSummaryScreen } from "@/screens/Placeholders";
import { colors } from "@/theme";

const Tab = createBottomTabNavigator();

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

export default function DriverTabs() {
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
        name="Schedule"
        component={CalendarScreen}
        options={{ tabBarIcon: tabIcon("calendar", "calendar-blank-outline") }}
      />
      <Tab.Screen
        name="Blocked"
        component={BlockedDatesScreen}
        options={{
          title: "Blocked dates",
          tabBarIcon: tabIcon("calendar-remove", "calendar-remove-outline"),
        }}
      />
      <Tab.Screen
        name="Payments"
        component={PaymentSummaryScreen}
        options={{
          tabBarIcon: tabIcon("cash-multiple", "cash-multiple"),
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
