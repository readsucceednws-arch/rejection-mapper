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
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => apiRequest("POST", "/api/zones", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/zones"] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) =>
      apiRequest("PUT", `/api/zones/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/zones"] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/zones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/zones"] }),
  });
}
