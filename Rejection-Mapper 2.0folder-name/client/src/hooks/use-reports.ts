import { useQuery } from "@tanstack/react-query";
import { useUser } from "./use-auth";

export interface ReportData {
  metadata: {
    organizationId: number;
    reportType: string;
    period: string;
    generatedAt: string;
    template?: string;
  };
  summary: {
    totalIssues: number;
    totalQuantity: number;
    avgQuantityPerIssue: number;
    uniqueCategories: number;
    uniqueItems: number;
    uniqueIssueTypes: number;
  };
  trends: {
    last7Days: any;
    last30Days: any;
  };
  topCategories: any[];
  topItems: any[];
  topIssueTypes: any[];
  insights: any[];
}

type ReportFilters = {
  startDate?: string;
  endDate?: string;
};

// New reporting hooks
export function useWeeklyReport() {
  const { data: user } = useUser();
  
  return useQuery<ReportData>({
    queryKey: ["/api/reporting/weekly", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/reporting/weekly/${user.organizationId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch weekly report");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useMonthlyReport() {
  const { data: user } = useUser();
  
  return useQuery<ReportData>({
    queryKey: ["/api/reporting/monthly", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/reporting/monthly/${user.organizationId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch monthly report");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useCustomReport(type: 'weekly' | 'monthly', from: string, to: string) {
  const { data: user } = useUser();
  
  return useQuery<ReportData>({
    queryKey: ["/api/reporting/custom", user?.organizationId, type, from, to],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/reporting/custom/${user.organizationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, from, to }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch custom report");
      }
      return response.json();
    },
    enabled: !!user?.organizationId && !!type && !!from && !!to,
  });
}

// Export functions
export async function exportWeeklyReportCSV(): Promise<void> {
  const { data: user } = useUser();
  
  if (!user?.organizationId) {
    throw new Error("No organization ID");
  }
  
  const response = await fetch(`/api/reporting/weekly/${user.organizationId}/csv`);
  if (!response.ok) {
    throw new Error("Failed to export weekly report");
  }
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'weekly-report.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function exportMonthlyReportCSV(): Promise<void> {
  const { data: user } = useUser();
  
  if (!user?.organizationId) {
    throw new Error("No organization ID");
  }
  
  const response = await fetch(`/api/reporting/monthly/${user.organizationId}/csv`);
  if (!response.ok) {
    throw new Error("Failed to export monthly report");
  }
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'monthly-report.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function exportCustomReportCSV(
  type: 'weekly' | 'monthly', 
  from: string, 
  to: string
): Promise<void> {
  const { data: user } = useUser();
  
  if (!user?.organizationId) {
    throw new Error("No organization ID");
  }
  
  const response = await fetch(`/api/reporting/custom/${user.organizationId}/csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, from, to }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to export custom report");
  }
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'custom-report.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// Legacy hook for backward compatibility
export function useReportSummary(filters?: ReportFilters) {
  return useQuery({
    queryKey: ["/api/reports/summary", filters],
    queryFn: async () => {
      const url = new URL("/api/reports/summary", window.location.origin);
      if (filters?.startDate) url.searchParams.append("startDate", filters.startDate);
      if (filters?.endDate) url.searchParams.append("endDate", filters.endDate);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report summary");
      
      return res.json();
    },
  });
}
