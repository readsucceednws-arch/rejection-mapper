import { useQuery } from "@tanstack/react-query";

export interface PartWiseData {
  partNumber: string;
  description: string | null;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export interface MonthWiseData {
  month: string;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export interface CostData {
  partNumber: string;
  description: string | null;
  price: number;
  rejectionQty: number;
  reworkQty: number;
  rejectionCost: number;
  reworkCost: number;
  totalCost: number;
}

interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  type?: string;
}

function buildQuery(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function usePartWiseAnalytics(filters: AnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<PartWiseData[]>({
    queryKey: ["/api/analytics/by-part", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-part${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch part analytics");
      return res.json();
    },
  });
}

export function useMonthWiseAnalytics(filters: AnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<MonthWiseData[]>({
    queryKey: ["/api/analytics/by-month", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-month${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch monthly analytics");
      return res.json();
    },
  });
}

export function useCostAnalytics(filters: AnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<CostData[]>({
    queryKey: ["/api/analytics/by-cost", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-cost${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cost analytics");
      return res.json();
    },
  });
}

export interface ZoneWiseData {
  zone: string;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export function useZoneWiseAnalytics(filters: Omit<AnalyticsFilters, "type"> = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return useQuery<ZoneWiseData[]>({
    queryKey: ["/api/analytics/by-zone", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-zone${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch zone analytics");
      return res.json();
    },
  });
}
