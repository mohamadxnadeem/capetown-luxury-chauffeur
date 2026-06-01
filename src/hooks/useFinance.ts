import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchFinanceSummary, type FinanceSummary } from "@/api/finance";

interface MonthBucket {
  start: string; // YYYY-MM-DD (range-clipped start of bucket)
  end: string; // YYYY-MM-DD (range-clipped end of bucket)
  label: string; // "Jan" — used as x-axis label
  monthKey: string; // YYYY-MM — stable react-query key
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Splits a [start, end] range into per-month buckets, clipping the first and
// last buckets to the actual range. Capped at 24 buckets so the chart doesn't
// fan out 60+ parallel finance-summary queries for absurd ranges.
function buildMonthBucketsForRange(start: Date, end: Date): MonthBucket[] {
  if (start > end) return [];
  const buckets: MonthBucket[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && buckets.length < 24) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const bucketStart = monthStart < start ? start : monthStart;
    const bucketEnd = monthEnd > end ? end : monthEnd;
    if (bucketStart <= bucketEnd) {
      buckets.push({
        start: isoDate(bucketStart),
        end: isoDate(bucketEnd),
        label: monthStart.toLocaleString("en", { month: "short" }),
        monthKey: `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

export interface MonthlyFinancePoint {
  label: string;
  monthKey: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface UseMonthlyFinanceResult {
  data: MonthlyFinancePoint[];
  totals: { revenue: number; expenses: number; profit: number };
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export interface FinanceRange {
  start: Date;
  end: Date;
}

// Bucketed per-month parallel fetch for the given range. Caching key per
// bucket — switching ranges reuses cached month data.
export function useMonthlyFinance(range: FinanceRange): UseMonthlyFinanceResult {
  const buckets = useMemo(
    () => buildMonthBucketsForRange(range.start, range.end),
    [range.start, range.end]
  );

  const queries = useQueries({
    queries: buckets.map((b) => ({
      // Include the clipped start/end in the key so a partial month (custom
      // range) is cached separately from a full-month version.
      queryKey: ["admin", "finance-summary", b.monthKey, b.start, b.end] as const,
      queryFn: () =>
        fetchFinanceSummary({ start_date: b.start, end_date: b.end }),
      staleTime: 60_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const data: MonthlyFinancePoint[] = buckets.map((b, i) => {
    const summary: FinanceSummary | undefined = queries[i]?.data;
    return {
      label: b.label,
      monthKey: b.monthKey,
      revenue: parseFloat(summary?.total_client_amount ?? "0") || 0,
      expenses: parseFloat(summary?.total_driver_amount ?? "0") || 0,
      profit: parseFloat(summary?.total_profit ?? "0") || 0,
    };
  });

  const totals = data.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      expenses: acc.expenses + p.expenses,
      profit: acc.profit + p.profit,
    }),
    { revenue: 0, expenses: 0, profit: 0 }
  );

  function refetch() {
    queries.forEach((q) => q.refetch());
  }

  return { data, totals, isLoading, isError, refetch };
}

// ---- Preset helpers -----------------------------------------------------

export type RangePreset =
  | "this_month"
  | "last_3"
  | "last_6"
  | "last_12"
  | "ytd"
  | "custom";

export function rangeForPreset(preset: RangePreset): FinanceRange {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start: Date;
  switch (preset) {
    case "this_month":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "last_3":
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      break;
    case "last_6":
      start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      break;
    case "last_12":
      start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      break;
    case "ytd":
      start = new Date(today.getFullYear(), 0, 1);
      break;
    default:
      // For "custom" we don't auto-compute — the caller passes its own range.
      // Return today→today as a sensible no-op fallback.
      start = end;
  }
  return { start, end };
}

export function formatRange({ start, end }: FinanceRange): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return fmt(start);
  }
  return `${fmt(start)} → ${fmt(end)}`;
}
