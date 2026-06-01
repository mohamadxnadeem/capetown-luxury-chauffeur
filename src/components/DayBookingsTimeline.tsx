import React, { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import type { BookedSlot } from "@/api/bookings";
import { colors } from "@/theme";

interface Props {
  date: string; // YYYY-MM-DD
  slots: BookedSlot[];
  onSlotPress: (slot: BookedSlot) => void;
}

// "09:00:00" / "09:00" → 9.0 decimal hours. Null/blank → fallback.
function toHours(t: string | null, fallback: number): number {
  if (!t) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return fallback;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

function hhmm(t: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

function statusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "confirmed":
      return { bg: "#dff0e7", fg: colors.primary };
    case "completed":
      return { bg: colors.surfaceMuted, fg: colors.muted };
    case "pending":
      return { bg: colors.partialBg, fg: colors.partialText };
    default:
      return { bg: colors.surfaceMuted, fg: colors.muted };
  }
}

// A full-day (00:00–24:00) timeline of a vehicle's booked windows for one
// date, plus a tappable list of those bookings. Both the bands on the bar
// and the list rows call onSlotPress.
export function DayBookingsTimeline({ date, slots, onSlotPress }: Props) {
  const sorted = useMemo(
    () =>
      [...slots].sort((a, b) =>
        toHours(a.start_time, 0) - toHours(b.start_time, 0)
      ),
    [slots]
  );

  const prettyDate = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString("en", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [date]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{prettyDate}</Text>
      <Text style={styles.sub}>
        {sorted.length === 0
          ? "No bookings on this day."
          : `${sorted.length} booking${sorted.length === 1 ? "" : "s"} — tap one to open it.`}
      </Text>

      {sorted.length > 0 ? (
        <>
          {/* 24h visual bar */}
          <View style={styles.track}>
            {[6, 12, 18].map((h) => (
              <View key={h} style={[styles.tick, { left: `${(h / 24) * 100}%` }]} />
            ))}
            {sorted.map((s, i) => {
              const start = toHours(s.start_time, 0);
              const end = toHours(s.end_time, 24);
              const left = (start / 24) * 100;
              const width = Math.max(((end - start) / 24) * 100, 3);
              return (
                <TouchableOpacity
                  key={`${s.booking_reference}-${i}`}
                  activeOpacity={0.7}
                  onPress={() => onSlotPress(s)}
                  style={[
                    styles.band,
                    { left: `${left}%`, width: `${width}%` },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.scaleRow}>
            <Text style={styles.scaleLabel}>00:00</Text>
            <Text style={styles.scaleLabel}>12:00</Text>
            <Text style={styles.scaleLabel}>24:00</Text>
          </View>

          {/* Tappable list of the day's bookings */}
          <View style={styles.list}>
            {sorted.map((s, i) => {
              const tone = statusTone(s.status);
              const range = s.start_time
                ? `${hhmm(s.start_time)} – ${s.end_time ? hhmm(s.end_time) : "end of day"}`
                : "All day";
              return (
                <TouchableOpacity
                  key={`${s.booking_reference}-row-${i}`}
                  activeOpacity={0.85}
                  onPress={() => onSlotPress(s)}
                  style={styles.row}
                >
                  <View style={styles.rowAccent} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTime}>{range}</Text>
                    <Text style={styles.rowRef}>{s.booking_reference}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.fg }]}>
                      {s.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  heading: { color: colors.heading, fontSize: 16, fontWeight: "800" },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 12 },

  track: {
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    justifyContent: "center",
  },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
  },
  band: {
    position: "absolute",
    top: 4,
    bottom: 4,
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  scaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 12,
  },
  scaleLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },

  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: 12,
    overflow: "hidden",
  },
  rowAccent: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
  },
  rowBody: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
  rowTime: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  rowRef: { color: colors.muted, fontSize: 12, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginRight: 6,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  chevron: { color: colors.muted, fontSize: 22 },
});
