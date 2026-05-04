import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import CalendarScreen from "@/screens/CalendarScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { BlockedDatesScreen, PaymentSummaryScreen } from "@/screens/Placeholders";

const Tab = createBottomTabNavigator();

export default function DriverTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Schedule" component={CalendarScreen} />
      <Tab.Screen name="Blocked" component={BlockedDatesScreen} options={{ title: "Blocked dates" }} />
      <Tab.Screen name="Payments" component={PaymentSummaryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
