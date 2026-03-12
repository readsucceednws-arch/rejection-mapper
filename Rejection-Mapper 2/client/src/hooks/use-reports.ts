import { useQuery } from "@tanstack/react-query";
import { api, ReportSummaryResponse } from "@shared/routes";

type ReportFilters = {
  startDate?: string;
  endDate?: string;
};

export function useReportSummary(filters?: ReportFilters) {
  return useQuery({
    queryKey: [api.reports.summary.path, filters],
    queryFn: async () => {
      const url = new URL(api.reports.summary.path, window.location.origin);
      if (filters?.startDate) url.searchParams.append("startDate", filters.startDate);
      if (filters?.endDate) url.searchParams.append("endDate", filters.endDate);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report summary");
      
      const json = await res.json();
      return api.reports.summary.responses[200].parse(json) as ReportSummaryResponse;
    },
  });
}
