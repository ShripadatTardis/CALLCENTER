import type { CallDataQueryDto } from '@/types/api/calls';

/**
 * Centralized TanStack Query key builders for the calls domain. Keep key
 * construction here rather than as inline array literals at call sites,
 * so filter-object shape stays consistent across every consumer (an
 * inline literal built differently in two places can produce cache
 * misses even when logically the same filters).
 */
export const callsKeys = {
  all: ['calls'] as const,
  lists: () => [...callsKeys.all, 'list'] as const,
  list: (filters: CallDataQueryDto) => [...callsKeys.lists(), filters] as const,
  sessions: () => [...callsKeys.all, 'session'] as const,
  session: (sessionId: string) => [...callsKeys.sessions(), sessionId] as const,
};
