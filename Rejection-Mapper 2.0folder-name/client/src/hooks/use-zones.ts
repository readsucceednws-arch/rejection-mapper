import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Zone {
  id: number;
  name: string;
  organizationId: number;
  createdAt: string;
}

export function useZones() {
  return useQuery<Zone[]>({
    queryKey: ["/api/zones"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/zones");
      return res.json();
    },
  });
}

export function useCreateZone() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/zones", { name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/zones"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PUT", `/api/zones/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/zones"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/zones/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/zones"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    },
  });
}
