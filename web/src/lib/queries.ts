import type { SubmissionDTO, SubmissionDetailDTO, Settings, UpdateSubmission } from '@prioritize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const useSubmissions = (status?: string) =>
  useQuery({ queryKey: ['submissions', status ?? 'all'], queryFn: () => api<SubmissionDTO[]>(`/submissions${status ? `?status=${status}` : ''}`) });

export const useSubmission = (id: string | null) =>
  useQuery({ queryKey: ['submission', id], enabled: !!id, queryFn: () => api<SubmissionDetailDTO>(`/submissions/${id}`) });

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });

export function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['submissions'] }), qc.invalidateQueries({ queryKey: ['submission'] })]);
}

export function usePatchSubmission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubmission }) => api<SubmissionDetailDTO>(`/submissions/${id}`, { method: 'PATCH', body: patch }),
    onSettled: () => invalidate(), // re-fetch so concurrent users converge on the server's answer
  });
}
