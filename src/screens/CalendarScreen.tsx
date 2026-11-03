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
import { cardWindow, dayCardsForDate, mergeByKey, uniqueSortedDates } from "@/utils/dayShifts";
import { calendarTheme, colors } from "@/theme";

interface CalendarItem {
  key: string;
  date: string;
  title: string;
  subtitle?: string;
  bookingId?: number | string;
  bookingRef?: string;
  groupId?: number | null;
}

// One item per booking (or same car in one group) per date. Split shifts and
// same-car group bookings merge into a single card with the whole window.
function adminBookingsToItems(all: Booking[]): CalendarItem[] {
  const dates = uniqueSortedDates(all.flatMap((b) => b.days ?? []));
  return dates.flatMap((date) =>
    dayCardsForDate(all, date)
      .filter((c) => c.entries.length > 0)
      .map((c) => {
        const b = c.firstBooking;
        const win = cardWindow(c.entries);
        const times = c.entries
          .map((e) => (e.day.start_time ?? "").slice(0, 5))
          .filter(Boolean);
        const windowLabel =
          c.entries.length > 1 && win.start
            ? `${win.start.slice(0, 5)} - ${(win.end ?? "").slice(0, 5)}${win.endNextDay ? " (next day)" : ""}`
            : times[0];
        return {
          key: c.key,
          date,
          title: b.customer_name || `Booking #${b.id}`,
          subtitle: [windowLabel, b.pickup_location].filter(Boolean).join(" · "),
          bookingId: b.id,
          bookingRef: b.booking_reference,
          groupId: c.groupId,
        };
      })
  );
}

function driverEventToItem(e: DriverScheduleEvent): CalendarItem {
  if (e.type === "blocked") {
    return {
      key: e.id,
      date: e.date,
      title: e.title,
      subtitle: e.reason ?? undefined,
    };
  }
  return {
    key: e.id,
    date: e.date,
    title: e.customer_name || e.booking_reference,
    subtitle: [e.start_time, e.pickup_location].filter(Boolean).join(" · "),
    bookingRef: e.booking_reference,
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
      // A driver only receives their own shifts. Two shifts of one booking on
      // one date show as one card.
      return mergeByKey(driverQuery.data ?? [], (e) =>
        e.type === "blocked" ? e.id : `${e.booking_reference}-${e.date}`
      ).map((group) => {
        const item = driverEventToItem(group[0]);
        if (group.length > 1) {
          const times = group.flatMap((e) =>
            e.type === "blocked" || !e.start_time
              ? []
              : [
                  `${e.start_time.slice(0, 5)}${e.end_time ? "-" + e.end_time.slice(0, 5) : ""}`,
                ]
          );
          const first = group[0];
          item.subtitle = [
            times.join(", "),
            first.type === "blocked" ? null : first.pickup_location,
          ]
            .filter(Boolean)
            .join(" · ");
        }
        return item;
      });
    }
    return adminBookingsToItems(adminQuery.data ?? []);
  }, [isDriver, adminQuery.data, driverQuery.data]);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const marked = useMemo(() => {
    const m: Record<
      string,
      { marked?: boolean; selected?: boolean; selectedColor?: string; dotColor?: string }
    > = {};
    for (const it of items) {
      m[it.date] = { ...(m[it.date] ?? {}), marked: true, dotColor: colors.primary };
    }
    m[selectedDate] = {
      ...(m[selectedDate] ?? {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return m;
  }, [items, selectedDate]);

  const dayItems = items.filter((it) => it.date === selectedDate);

  function onItemPress(item: CalendarItem) {
    if (!isDriver && item.groupId != null) {
      navigation.navigate("BookingGroupDetail", { groupId: item.groupId });
    } else if (isDriver && item.bookingRef) {
      navigation.navigate("BookingDetail", { bookingRef: item.bookingRef });
    } else if (!isDriver && item.bookingId != null) {
      navigation.navigate("BookingDetail", { bookingId: item.bookingId });
    }
  }

  return (
    <FlatList
      style={styles.container}
      data={dayItems}
      keyExtractor={(it) => it.key}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => refetch()}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <>
          <Calendar
            markedDates={marked}
            onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
            enableSwipeMonths
            theme={calendarTheme}
          />
          <View style={styles.listHeader}>
            <Text variant="titleMedium" style={styles.listHeaderTitle}>
              {selectedDate}
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              {dayItems.length} item{dayItems.length === 1 ? "" : "s"}
            </Text>
          </View>
        </>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  listHeaderTitle: { color: colors.heading, fontWeight: "700" },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  empty: { padding: 32, alignItems: "center" },
  muted: { color: colors.muted },
});
