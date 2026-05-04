import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import CalendarScreen from "@/screens/CalendarScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import {
  DriverListScreen,
  FinanceSummaryScreen,
  NewBookingScreen,
  VehicleListScreen,
} from "@/screens/Placeholders";

const Tab = createBottomTabNavigator();

export default function AdminTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="New" component={NewBookingScreen} options={{ title: "New Booking" }} />
      <Tab.Screen name="Drivers" component={DriverListScreen} />
      <Tab.Screen name="Vehicles" component={VehicleListScreen} />
      <Tab.Screen name="Finance" component={FinanceSummaryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
