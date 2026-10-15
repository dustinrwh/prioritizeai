import type { UserDTO } from '@prioritize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiFail } from './api';

interface AuthState { user: UserDTO | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthState>({ user: null, loading: true, refresh: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await api<UserDTO>('/me');
      } catch (e) {
        if (e instanceof ApiFail && e.status === 401) return null;
        throw e;
      }
    },
  });
  const value: AuthState = {
    user: data ?? null,
    loading: isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
    signOut: async () => {
      await api('/auth/logout', { method: 'POST', body: {} });
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
