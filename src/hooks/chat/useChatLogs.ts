import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchChatLogs } from '@/services/chat/chatService';

export function useChatLogs(page = 1) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: ['chat', 'logs', page, role],
    queryFn: () => fetchChatLogs(role, { page, pageSize: 25 }),
    enabled: Boolean(user),
  });
}
