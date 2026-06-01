import React, { useState } from "react";
import { Dimensions, StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { BarChart, LineChart } from "react-native-gifted-charts";
import {
  useMonthlyFinance,
  type FinanceRange,
  type MonthlyFinancePoint,
} from "@/hooks/useFinance";
import { colors } from "@/theme";

type ChartKind = "bar" | "line";

const REVENUE_COLOR = colors.primary;
const EXPENSES_COLOR = "#b03b3b";

function formatRand(n: number): string {
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(1)}k`;
  return `R ${n.toFixed(0)}`;
}

export function FinanceGraphs({
  range,
  hideHeader,
}: {
  range: FinanceRange;
  hideHeader?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useMonthlyFinance(range);

  if (isLoading && data.every((p) => p.revenue === 0 && p.expenses === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Couldn't load finance data.</Text>
        <TouchableOpacity onPress={refetch} hitSlop={8} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No data for this range.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!hideHeader ? (
        <View style={styles.header}>
          <Text style={styles.eyebrow}>FINANCE</Text>
          <Text style={styles.headerTitle}>Overview</Text>
        </View>
      ) : null}
      <CombinedChartCard data={data} />
    </View>
  );
}

function CombinedChartCard({ data }: { data: MonthlyFinancePoint[] }) {
  const [kind, setKind] = useState<ChartKind>("bar");

  // Card sits inside a 16px page margin + 16px internal padding on each side.
  const chartWidth = Dimensions.get("window").width - 64;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEyebrow}>REVENUE vs EXPENSES</Text>
          <View style={styles.legendRow}>
            <LegendDot color={REVENUE_COLOR} label="Revenue" />
            <LegendDot color={EXPENSES_COLOR} label="Expenses" />
          </View>
        </View>
        <Toggle kind={kind} onChange={setKind} />
      </View>

      {kind === "bar" ? (
        <GroupedBarChart data={data} chartWidth={chartWidth} />
      ) : (
        <DualLineChart data={data} chartWidth={chartWidth} />
      )}
    </View>
  );
}

// Grouped bars: revenue and expenses bars sit side-by-side per month. The
// gifted-charts library has no native "grouped" mode, so we interleave the
// data array and use `spacing` to control the gap between bars within a
// group vs. between groups.
function GroupedBarChart({
  data,
  chartWidth,
}: {
  data: MonthlyFinancePoint[];
  chartWidth: number;
}) {
  const groupGap = Math.max(18, chartWidth / data.length - 30);

  const barData = data.flatMap((p, i) => [
    {
      value: p.revenue,
      label: p.label,
      frontColor: REVENUE_COLOR,
      // Tight spacing between the two bars in the same month.
      spacing: 2,
      labelTextStyle: { color: colors.muted, fontSize: 11 },
    },
    {
      value: p.expenses,
      frontColor: EXPENSES_COLOR,
      // Wider spacing after the second bar separates this month from the next.
      spacing: i === data.length - 1 ? 0 : groupGap,
    },
  ]);

  return (
    <BarChart
      data={barData}
      width={chartWidth}
      height={180}
      barWidth={14}
      barBorderRadius={4}
      initialSpacing={10}
      noOfSections={4}
      yAxisColor="transparent"
      xAxisColor={colors.border}
      yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
      rulesColor={colors.border}
      rulesType="solid"
      hideRules={false}
      formatYLabel={(v) => formatRand(Number(v))}
      isAnimated
      animationDuration={500}
    />
  );
}

// Two lines on the same chart — revenue and expenses. `secondaryData` is the
// gifted-charts built-in for a second series sharing the same axes.
function DualLineChart({
  data,
  chartWidth,
}: {
  data: MonthlyFinancePoint[];
  chartWidth: number;
}) {
  const spacing = Math.max(28, chartWidth / data.length - 14);

  return (
    <LineChart
      data={data.map((p) => ({ value: p.revenue, label: p.label }))}
      secondaryData={data.map((p) => ({ value: p.expenses }))}
      width={chartWidth}
      height={180}
      color={REVENUE_COLOR}
      thickness={3}
      dataPointsColor={REVENUE_COLOR}
      dataPointsRadius={4}
      secondaryLineConfig={{
        color: EXPENSES_COLOR,
        thickness: 3,
        dataPointsColor: EXPENSES_COLOR,
        dataPointsRadius: 4,
      }}
      spacing={spacing}
      initialSpacing={10}
      noOfSections={4}
      yAxisColor="transparent"
      xAxisColor={colors.border}
      xAxisLabelTextStyle={{ color: colors.muted, fontSize: 11 }}
      yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
      rulesColor={colors.border}
      rulesType="solid"
      hideRules={false}
      formatYLabel={(v) => formatRand(Number(v))}
      curved
      isAnimated
      animationDuration={500}
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function Toggle({
  kind,
  onChange,
}: {
  kind: ChartKind;
  onChange: (k: ChartKind) => void;
}) {
  return (
    <View style={styles.toggle}>
      <TouchableOpacity
        onPress={() => onChange("bar")}
        hitSlop={6}
        style={[styles.toggleBtn, kind === "bar" && styles.toggleBtnActive]}
      >
        <Text
          style={[
            styles.toggleText,
            kind === "bar" && styles.toggleTextActive,
          ]}
        >
          Bar
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange("line")}
        hitSlop={6}
        style={[styles.toggleBtn, kind === "line" && styles.toggleBtnActive]}
      >
        <Text
          style={[
            styles.toggleText,
            kind === "line" && styles.toggleTextActive,
          ]}
        >
          Line
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  headerTitle: {
    color: colors.heading,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  center: { padding: 32, alignItems: "center" },
  muted: { color: colors.muted },
  retry: { marginTop: 12 },
  retryText: { color: colors.primary, fontWeight: "700" },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  legendRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { color: colors.text, fontSize: 12, fontWeight: "600" },

  // Toggle
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toggleText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  toggleTextActive: { color: colors.heading },
});
