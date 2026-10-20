import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDatasetMode } from '@/contexts/DatasetModeContext';
import { fetchChatSessionDetail } from '@/services/chat/chatService';

export function useChatSessionDetail(sessionId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const { datasetId } = useDatasetMode();

  return useQuery({
    queryKey: ['chat', 'detail', sessionId, role, datasetId],
    queryFn: () => fetchChatSessionDetail(role, sessionId as string, datasetId),
    enabled: Boolean(user) && Boolean(sessionId),
  });
}
