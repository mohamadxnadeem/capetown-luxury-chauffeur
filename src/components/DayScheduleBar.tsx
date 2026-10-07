import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { colors } from "@/theme";

interface Props {
  // "HH:MM:SS" or "HH:MM" — end may be null.
  startTime: string | null;
  endTime: string | null;
  // True when this day's end_time falls on the day AFTER its date (overnight
  // shift). We draw the block from startTime up to midnight (24:00) and
  // append a "→" indicator showing the shift continues into the next day.
  endNextDay?: boolean;
  // When a previous day's overnight shift ended on THIS date, pass that
  // end time here (e.g. "02:00:00") so we prepend a small morning-tail
  // block from 00:00 → that time. The tail renders slightly muted so it
  // reads as "carrying over" rather than a native shift on this date.
  morningTailEndTime?: string | null;
}

// Full-day visible window — needed to show the midnight boundary for
// overnight shifts and morning tails (00:00 → tail end).
const WINDOW_START = 0; // 00:00
const WINDOW_END = 24; // 24:00
const WINDOW_SPAN = WINDOW_END - WINDOW_START;

// "09:00:00" / "09:00" → 9.0 (decimal hours). Returns null on bad input.
function toHours(t: string | null | undefined): number | null {
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

function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

// A horizontal 00:00–24:00 timeline with the booked window filled in emerald.
// Overnight shifts (end_next_day) render as start → 24:00 on this day's bar
// AND can inject a morning tail (00:00 → tailEndTime) when the previous
// day's overnight ends on this date. When there's no end time, renders a
// thin marker at the start instead of a block. When there's no start time
// at all, shows a muted "time TBC" track.
export function DayScheduleBar({
  startTime,
  endTime,
  endNextDay,
  morningTailEndTime,
}: Props) {
  const startH = toHours(startTime);
  const endH = toHours(endTime);
  const tailEndH = toHours(morningTailEndTime);

  // Hour ticks every 3h across the window for light visual reference.
  const ticks: number[] = [];
  for (let h = WINDOW_START + 3; h < WINDOW_END; h += 3) ticks.push(h);

  // Primary block logic — depends on whether this day crosses midnight.
  //
  //   Normal day (end > start, no overnight flag):
  //     block spans startH → endH
  //   Overnight (end_next_day true, operator typed end<start):
  //     block spans startH → 24:00, with a "→ continues" chevron at the
  //     right edge
  //   Start only (end null or end<=start with no overnight flag):
  //     thin marker at startH
  const hasOvernightBlock =
    !!endNextDay && startH != null && endH != null && endH < startH;
  const hasNormalBlock =
    !hasOvernightBlock &&
    startH != null &&
    endH != null &&
    endH > startH;
  const hasStartOnly =
    !hasOvernightBlock && !hasNormalBlock && startH != null;

  const normalLeft = hasNormalBlock ? pct(startH as number) : 0;
  const normalWidth = hasNormalBlock
    ? pct(endH as number) - pct(startH as number)
    : 0;
  const overnightLeft = hasOvernightBlock ? pct(startH as number) : 0;
  const overnightWidth = hasOvernightBlock ? 100 - overnightLeft : 0;

  // Morning tail from a previous overnight shift ending on this date.
  const hasTail = tailEndH != null && tailEndH > 0;
  const tailWidth = hasTail ? pct(tailEndH as number) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {ticks.map((h) => (
          <View
            key={h}
            style={[styles.tick, { left: `${pct(h)}%` }]}
          />
        ))}

        {/* Morning tail from previous day's overnight — rendered first so
            it sits beneath the day's own block if they overlap (they
            shouldn't, but defensive). */}
        {hasTail ? (
          <View
            style={[
              styles.tailBlock,
              { left: `0%`, width: `${Math.max(tailWidth, 2)}%` },
            ]}
          />
        ) : null}

        {hasNormalBlock ? (
          <View
            style={[
              styles.block,
              { left: `${normalLeft}%`, width: `${Math.max(normalWidth, 4)}%` },
            ]}
          />
        ) : null}

        {hasOvernightBlock ? (
          <View
            style={[
              styles.block,
              {
                left: `${overnightLeft}%`,
                width: `${Math.max(overnightWidth, 4)}%`,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
            ]}
          />
        ) : null}

        {hasStartOnly ? (
          <View style={[styles.marker, { left: `${pct(startH as number)}%` }]} />
        ) : null}
      </View>

      <View style={styles.labelsRow}>
        <Text style={styles.edgeLabel}>00:00</Text>
        <Text style={styles.timeLabel}>
          {startH == null && !hasTail
            ? "Time to be confirmed"
            : hasOvernightBlock
              ? `${hhmm(startTime)} – ${hhmm(endTime)} (next day)`
              : hasNormalBlock
                ? `${hhmm(startTime)} – ${hhmm(endTime)}`
                : hasTail && startH == null
                  ? `00:00 – ${hhmm(morningTailEndTime)} (from previous day)`
                  : hasStartOnly
                    ? `From ${hhmm(startTime)}`
                    : ""}
        </Text>
        <Text style={styles.edgeLabel}>24:00</Text>
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
  // Morning tail — rendered in a slightly muted emerald so it reads as
  // "carrying over from the previous day" rather than a native shift.
  tailBlock: {
    position: "absolute",
    top: 3,
    bottom: 3,
    backgroundColor: colors.primary,
    opacity: 0.55,
    borderRadius: 6,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
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
