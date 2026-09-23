import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/services/transport/errors';

/**
 * Shared QueryClient config. No usage of TanStack Query existed
 * anywhere in this repo before Session 1 (installed, unused) — this is
 * a fresh convention, not a match to existing precedent.
 *
 * - staleTime: short-to-moderate default for semi-live operational
 *   data; individual queries can override where a screen needs fresher
 *   or more cacheable data.
 * - retry: skips retrying on 4xx (client/auth errors are not
 *   transient), retries a couple of times on network failures or 5xx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
