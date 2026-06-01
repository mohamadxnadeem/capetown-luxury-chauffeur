import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { colors } from "@/theme";

interface Props {
  // "HH:MM:SS" or "HH:MM" — end may be null.
  startTime: string | null;
  endTime: string | null;
}

// The visible window of the timeline. Most chauffeur work happens in daytime;
// 05:00–23:00 keeps short trips visible without wasting width on dead hours.
const WINDOW_START = 5; // 05:00
const WINDOW_END = 23; // 23:00
const WINDOW_SPAN = WINDOW_END - WINDOW_START;

// "09:00:00" / "09:00" → 9.0 (decimal hours). Returns null on bad input.
function toHours(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min)) return null;
  return h + min / 60;
}

// Clamp a decimal hour into the visible window, return 0-100 percentage.
function pct(hour: number): number {
  const clamped = Math.min(WINDOW_END, Math.max(WINDOW_START, hour));
  return ((clamped - WINDOW_START) / WINDOW_SPAN) * 100;
}

function hhmm(t: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

// A horizontal 05:00–23:00 timeline with the booked window filled in emerald.
// When there's no end time, renders a thin marker at the start instead of a
// block. When there's no start time at all, shows a muted "time TBC" track.
export function DayScheduleBar({ startTime, endTime }: Props) {
  const startH = toHours(startTime);
  const endH = toHours(endTime);

  // Hour ticks every 3h across the window for light visual reference.
  const ticks: number[] = [];
  for (let h = WINDOW_START; h <= WINDOW_END; h += 3) ticks.push(h);

  const hasBlock = startH != null && endH != null && endH > startH;
  const hasStartOnly = startH != null && (endH == null || endH <= startH);

  const left = startH != null ? pct(startH) : 0;
  const width =
    hasBlock && endH != null ? pct(endH) - pct(startH as number) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {ticks.map((h) => (
          <View
            key={h}
            style={[styles.tick, { left: `${pct(h)}%` }]}
          />
        ))}

        {hasBlock ? (
          <View
            style={[
              styles.block,
              { left: `${left}%`, width: `${Math.max(width, 4)}%` },
            ]}
          />
        ) : null}

        {hasStartOnly ? (
          <View style={[styles.marker, { left: `${left}%` }]} />
        ) : null}
      </View>

      <View style={styles.labelsRow}>
        <Text style={styles.edgeLabel}>{WINDOW_START}:00</Text>
        <Text style={styles.timeLabel}>
          {startH == null
            ? "Time to be confirmed"
            : hasBlock
              ? `${hhmm(startTime)} – ${hhmm(endTime)}`
              : `From ${hhmm(startTime)}`}
        </Text>
        <Text style={styles.edgeLabel}>{WINDOW_END}:00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  track: {
    height: 26,
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
  block: {
    position: "absolute",
    top: 3,
    bottom: 3,
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  marker: {
    position: "absolute",
    top: 3,
    bottom: 3,
    width: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  edgeLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  timeLabel: {
    color: colors.heading,
    fontSize: 12,
    fontWeight: "700",
  },
});
