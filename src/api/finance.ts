import { api } from "./client";

// GET /api/admin/finance-summary/
// All amounts come back as strings (Django Decimal serialization). Parse
// with parseFloat only when needed for arithmetic.
export interface FinanceSummary {
  total_client_amount: string;
  total_driver_amount: string;
  total_profit: string;
  unpaid_driver_amount: string;
  // Backend may include start_date / end_date when filtered; the docs don't
  // pin this down so we type it loosely.
  start_date?: string;
  end_date?: string;
}

export async function fetchFinanceSummary(
  params?: {
    start_date?: string;
    end_date?: string;
    driver?: number;
    car?: number;
  }
): Promise<FinanceSummary> {
  const resp = await api.get<FinanceSummary>("/api/admin/finance-summary/", {
    params,
  });
  return resp.data;
}
