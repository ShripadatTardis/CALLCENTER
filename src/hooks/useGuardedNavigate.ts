import { useNavigate, type NavigateOptions } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, hasPermission } from '@/contexts/AuthContext';

/**
 * A `navigate()` that checks a functional permission BEFORE leaving the
 * current page. User-reported during Session 15 E2E: clicking a
 * permission-gated card (e.g. a Performance Ratio, as Operator — who
 * lacks `ratios.view`) replaced the whole page with `ProtectedRoute`'s
 * full-page "Not authorized" takeover. That's a jarring, unnecessary
 * navigation for something the UI already knew would be denied — the
 * destination's permission requirement is known at the click site, so
 * it's checked here first: on denial, stay on the current page and show
 * a toast; only navigate when the destination is actually reachable.
 * `ProtectedRoute`'s own full-page denial is kept as the server/route-
 * level backstop for direct URL entry/bookmarks, unchanged — this hook
 * only improves the in-app click path, it doesn't replace that gate.
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (path: string, options: NavigateOptions | undefined, permission: string, destinationLabel: string) => {
    if (!hasPermission(user, permission)) {
      toast.error(`You don't have permission to view ${destinationLabel}.`);
      return;
    }
    navigate(path, options);
  };
}
