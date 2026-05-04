import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "@/state/auth";
import { useAdminBookings } from "@/hooks/useBookings";
import { useDriverSchedule } from "@/hooks/useSchedule";
import type { Booking, DriverScheduleEvent } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";

interface CalendarItem {
  key: string;
  date: string;
  title: string;
  subtitle?: string;
  bookingId?: number | string;
  bookingRef?: string;
}

function adminBookingToItems(b: Booking): CalendarItem[] {
  // Expand a booking across its days if available; otherwise fall back to
  // start_date so something shows on the calendar.
  if (Array.isArray(b.days) && b.days.length > 0) {
    return b.days.map((d) => ({
      key: `b${b.id}-d${d.id}`,
      date: d.date,
      title: b.customer_name ?? `Booking #${b.id}`,
      subtitle: [d.start_time, d.pickup_location].filter(Boolean).join(" · "),
      bookingId: b.id,
      bookingRef: b.booking_ref,
    }));
  }
  if (b.start_date) {
    return [
      {
        key: `b${b.id}`,
        date: b.start_date,
        title: b.customer_name ?? `Booking #${b.id}`,
        subtitle: b.status,
        bookingId: b.id,
        bookingRef: b.booking_ref,
      },
    ];
  }
  return [];
}

function driverEventToItem(e: DriverScheduleEvent): CalendarItem {
  return {
    key: `e${e.id}`,
    date: e.date,
    title: e.customer_name ?? e.booking_ref ?? "Trip",
    subtitle: [e.start_time, e.pickup_location].filter(Boolean).join(" · "),
    bookingRef: e.booking_ref,
  };
}

export default function CalendarScreen() {
  const role = useAuthStore((s) => s.role);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const adminQuery = useAdminBookings();
  const driverQuery = useDriverSchedule();

  const isDriver = role === "driver";
  const loading = isDriver ? driverQuery.isLoading : adminQuery.isLoading;
  const refreshing = isDriver ? driverQuery.isRefetching : adminQuery.isRefetching;
  const refetch = isDriver ? driverQuery.refetch : adminQuery.refetch;

  const items: CalendarItem[] = useMemo(() => {
    if (isDriver) {
      return (driverQuery.data ?? []).map(driverEventToItem);
    }
    return (adminQuery.data ?? []).flatMap(adminBookingToItems);
  }, [isDriver, adminQuery.data, driverQuery.data]);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const marked = useMemo(() => {
    const m: Record<string, { marked?: boolean; selected?: boolean; selectedColor?: string }> = {};
    for (const it of items) {
      m[it.date] = { ...(m[it.date] ?? {}), marked: true };
    }
    m[selectedDate] = { ...(m[selectedDate] ?? {}), selected: true, selectedColor: "#000" };
    return m;
  }, [items, selectedDate]);

  const dayItems = items.filter((it) => it.date === selectedDate);

  function onItemPress(item: CalendarItem) {
    if (isDriver && item.bookingRef) {
      navigation.navigate("BookingDetail", { bookingRef: item.bookingRef });
    } else if (!isDriver && item.bookingId != null) {
      navigation.navigate("BookingDetail", { bookingId: item.bookingId });
    }
  }

  return (
    <View style={styles.container}>
      <Calendar
        markedDates={marked}
        onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
        enableSwipeMonths
      />
      <View style={styles.listHeader}>
        <Text variant="titleMedium">{selectedDate}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {dayItems.length} item{dayItems.length === 1 ? "" : "s"}
        </Text>
      </View>
      <FlatList
        data={dayItems}
        keyExtractor={(it) => it.key}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.muted}>
              {loading ? "Loading…" : "Nothing scheduled."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => onItemPress(item)}>
            <Card.Content>
              <Text variant="titleSmall">{item.title}</Text>
              {item.subtitle ? (
                <Text variant="bodySmall" style={styles.muted}>
                  {item.subtitle}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: { marginHorizontal: 16, marginVertical: 6 },
  empty: { padding: 24, alignItems: "center" },
  muted: { opacity: 0.6 },
});
