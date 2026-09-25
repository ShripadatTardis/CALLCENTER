import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchChatSessionDetail } from '@/services/chat/chatService';

export function useChatSessionDetail(sessionId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: ['chat', 'detail', sessionId, role],
    queryFn: () => fetchChatSessionDetail(role, sessionId as string),
    enabled: Boolean(user) && Boolean(sessionId),
  });
}
