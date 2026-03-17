import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { RejectionEntryResponse } from "@shared/schema";
import { z } from "zod";

type EntryFilters = {
  startDate?: string;
  endDate?: string;
  partId?: number;
  rejectionTypeId?: number;
};

export function useRejectionEntries(filters?: EntryFilters) {
  return useQuery({
    queryKey: [api.rejectionEntries.list.path, filters],
    queryFn: async () => {
      const url = new URL(api.rejectionEntries.list.path, window.location.origin);
      if (filters?.startDate) url.searchParams.append("startDate", filters.startDate);
      if (filters?.endDate) url.searchParams.append("endDate", filters.endDate);
      if (filters?.partId) url.searchParams.append("partId", filters.partId.toString());
      if (filters?.rejectionTypeId) url.searchParams.append("rejectionTypeId", filters.rejectionTypeId.toString());

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rejection entries");
      
      // Parse using the schema, and type assertion for the relations
      const json = await res.json();
      return api.rejectionEntries.list.responses[200].parse(json) as RejectionEntryResponse[];
    },
  });
}

export function useUpdateRejectionEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { rejectionTypeId?: number; quantity?: number; remarks?: string | null } }) => {
      const res = await fetch(`/api/rejection-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update entry");
      }
      return res.json() as Promise<RejectionEntryResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.summary.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-part"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-month"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-cost"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}

export function useBulkDeleteRejectionEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/rejection-entries/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete entries");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.summary.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-part"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-month"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-cost"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}

export function useCreateRejectionEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.rejectionEntries.create.input>) => {
      const validated = api.rejectionEntries.create.input.parse(data);
      const res = await fetch(api.rejectionEntries.create.path, {
        method: api.rejectionEntries.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        const text = await res.text();
        let message = "Failed to log rejection entry";

        if (text) {
          try {
            const err = JSON.parse(text) as { message?: string };
            message = err.message || message;
          } catch {
            message = text;
          }
        }

        throw new Error(message);
      }
      return api.rejectionEntries.create.responses[201].parse(await res.json()) as RejectionEntryResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.reports.summary.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-part"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-month"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-cost"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}
