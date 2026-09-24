import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchChatSessionDetail } from '@/services/chat/chatService';

export function useChatSessionDetail(chatSessionId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: ['chat', 'detail', chatSessionId, role],
    queryFn: () => fetchChatSessionDetail(role, chatSessionId as string),
    enabled: Boolean(user) && Boolean(chatSessionId),
  });
}
