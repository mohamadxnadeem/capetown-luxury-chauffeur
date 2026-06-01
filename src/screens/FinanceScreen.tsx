import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, DateData } from "react-native-calendars";
import { FinanceGraphs } from "@/components/FinanceGraphs";
import {
  formatRange,
  rangeForPreset,
  useMonthlyFinance,
  type FinanceRange,
  type RangePreset,
} from "@/hooks/useFinance";
import { useAdminBookings } from "@/hooks/useBookings";
import { calendarTheme, colors } from "@/theme";

function formatRand(n: number): string {
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${n.toFixed(0)}`;
}

interface PresetChip {
  key: RangePreset;
  label: string;
}

const PRESETS: PresetChip[] = [
  { key: "this_month", label: "This month" },
  { key: "last_3", label: "3M" },
  { key: "last_6", label: "6M" },
  { key: "last_12", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export default function FinanceScreen() {
  const [activePreset, setActivePreset] = useState<RangePreset>("last_6");
  const [customRange, setCustomRange] = useState<FinanceRange | null>(null);
  const [pickerOpen, setPickerOpen] = useState<"start" | "end" | null>(null);

  // Resolve the active range: preset → computed; custom → user-picked.
  const range: FinanceRange = useMemo(() => {
    if (activePreset === "custom" && customRange) return customRange;
    return rangeForPreset(activePreset);
  }, [activePreset, customRange]);

  function selectPreset(p: RangePreset) {
    if (p === "custom") {
      // First time we land on Custom, seed with the current resolved range so
      // the user has a starting point instead of two empty fields.
      if (!customRange) setCustomRange(range);
      setActivePreset("custom");
    } else {
      setActivePreset(p);
    }
  }

  function pickDate(iso: string) {
    if (!pickerOpen || !customRange) {
      setPickerOpen(null);
      return;
    }
    const picked = dateFromIso(iso);
    setCustomRange((prev) => {
      if (!prev) return prev;
      if (pickerOpen === "start") {
        // Keep start ≤ end; if user picks a start past current end, push end too.
        const newStart = picked;
        const newEnd = picked > prev.end ? picked : prev.end;
        return { start: newStart, end: newEnd };
      }
      // pickerOpen === "end"
      const newEnd = picked;
      const newStart = picked < prev.start ? picked : prev.start;
      return { start: newStart, end: newEnd };
    });
    setPickerOpen(null);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CAPE TOWN CONCIERGE</Text>
        <Text style={styles.title}>Finance</Text>
        <Text style={styles.subtitle}>{formatRange(range)}</Text>
      </View>

      <View style={styles.chipsRow}>
        {PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => selectPreset(p.key)}
              activeOpacity={0.85}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activePreset === "custom" && customRange ? (
        <View style={styles.customCard}>
          <Text style={styles.customLabel}>CUSTOM RANGE</Text>
          <View style={styles.customRow}>
            <DateField
              label="Start"
              value={customRange.start}
              onPress={() => setPickerOpen("start")}
            />
            <View style={styles.customArrow}>
              <Text style={styles.customArrowText}>→</Text>
            </View>
            <DateField
              label="End"
              value={customRange.end}
              onPress={() => setPickerOpen("end")}
            />
          </View>
        </View>
      ) : null}

      <SummaryStrip range={range} />

      <FinanceGraphs range={range} hideHeader />

      <DatePickerModal
        visible={pickerOpen !== null}
        title={pickerOpen === "start" ? "Start date" : "End date"}
        initialDate={
          pickerOpen === "start"
            ? customRange?.start
            : customRange?.end
        }
        // For "end" picker, never allow before start.
        minDate={pickerOpen === "end" ? isoDate(customRange?.start ?? new Date()) : undefined}
        // For "start" picker, never allow after end.
        maxDate={pickerOpen === "start" ? isoDate(customRange?.end ?? new Date()) : undefined}
        onDismiss={() => setPickerOpen(null)}
        onPick={pickDate}
      />
    </ScrollView>
  );
}

function SummaryStrip({ range }: { range: FinanceRange }) {
  const { totals, isLoading } = useMonthlyFinance(range);
  // Booking count over the range. The finance summary endpoint doesn't return
  // a count, so we ask the bookings list with date filters and count rows.
  const startIso = isoDate(range.start);
  const endIso = isoDate(range.end);
  const bookingsQuery = useAdminBookings({
    start_date: startIso,
    end_date: endIso,
  });
  const count = bookingsQuery.data?.length ?? 0;
  const showCount = bookingsQuery.isLoading ? "—" : String(count);

  return (
    <View style={styles.summaryRow}>
      <SummaryCard
        label="Bookings"
        value={showCount}
        tone={colors.heading}
      />
      <SummaryCard
        label="Revenue"
        value={isLoading ? "—" : formatRand(totals.revenue)}
        tone={colors.primary}
      />
      <SummaryCard
        label="Expenses"
        value={isLoading ? "—" : formatRand(totals.expenses)}
        tone="#b03b3b"
      />
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.summaryValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: Date;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.dateField}
    >
      <Text style={styles.dateFieldLabel}>{label}</Text>
      <Text style={styles.dateFieldValue}>
        {value.toLocaleDateString("en", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </Text>
    </TouchableOpacity>
  );
}

function DatePickerModal({
  visible,
  title,
  initialDate,
  minDate,
  maxDate,
  onDismiss,
  onPick,
}: {
  visible: boolean;
  title: string;
  initialDate?: Date;
  minDate?: string;
  maxDate?: string;
  onDismiss: () => void;
  onPick: (iso: string) => void;
}) {
  // Reset the calendar's visible month each time the modal opens so the user
  // sees the right month for the date they're editing.
  const [renderKey, setRenderKey] = useState(0);
  useEffect(() => {
    if (visible) setRenderKey((k) => k + 1);
  }, [visible]);

  const initialIso = initialDate ? isoDate(initialDate) : undefined;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.modalRoot} edges={["top"]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onDismiss} hitSlop={8}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.modalContent}>
          <View style={styles.modalCalendarShell}>
            <Calendar
              key={renderKey}
              current={initialIso}
              markedDates={
                initialIso
                  ? {
                      [initialIso]: { selected: true, selectedColor: colors.primary },
                    }
                  : {}
              }
              minDate={minDate}
              maxDate={maxDate}
              onDayPress={(d: DateData) => onPick(d.dateString)}
              theme={calendarTheme}
              enableSwipeMonths
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 32 },

  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    color: colors.heading,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  chipTextActive: { color: colors.onPrimary },

  customCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  customArrow: { paddingHorizontal: 4 },
  customArrowText: { color: colors.muted, fontSize: 16, fontWeight: "700" },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.3,
  },

  dateField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFieldLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dateFieldValue: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },

  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalCancel: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  modalTitle: { color: colors.heading, fontWeight: "800", fontSize: 16 },
  modalContent: { padding: 16 },
  modalCalendarShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
