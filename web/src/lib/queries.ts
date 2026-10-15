import type { ImpactSuggestionDTO, SubmissionDTO, SubmissionDetailDTO, Settings, UpdateSubmission, WinRange, WinsDTO } from '@prioritize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const useSubmissions = (status?: string) =>
  useQuery({ queryKey: ['submissions', status ?? 'all'], queryFn: () => api<SubmissionDTO[]>(`/submissions${status ? `?status=${status}` : ''}`) });

/** Poll briefly while the automatic AI impact estimate (fired when a project moves to Done) is being generated. */
const awaitingEstimate = (d?: SubmissionDetailDTO) =>
  !!d && d.status === 'done' && !d.impact && !d.impact_suggestion && !!d.completed_at && Date.now() - Date.parse(d.completed_at) < 60_000;

export const useSubmission = (id: string | null) =>
  useQuery({
    queryKey: ['submission', id],
    enabled: !!id,
    queryFn: () => api<SubmissionDetailDTO>(`/submissions/${id}`),
    refetchInterval: (q) => (awaitingEstimate(q.state.data) ? 3000 : false),
  });

export const useWins = (range: WinRange) => useQuery({ queryKey: ['wins', range], queryFn: () => api<WinsDTO>(`/wins?range=${range}`) });

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });

export function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['submissions'] }), qc.invalidateQueries({ queryKey: ['submission'] })]);
}

export function usePatchSubmission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubmission }) => api<SubmissionDetailDTO>(`/submissions/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (detail, { id, patch }) => {
      // A project just finished: ask for the AI impact estimate in the background. A person reviews it before it counts.
      if (patch.status === 'done' && !detail.impact && !detail.impact_suggestion) {
        api<ImpactSuggestionDTO>(`/submissions/${id}/impact-suggest`, { method: 'POST', body: { trigger: 'auto' } })
          .catch(() => {})
          .finally(() => invalidate());
      }
    },
    onSettled: () => invalidate(), // re-fetch so concurrent users converge on the server's answer
  });
}
