import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDatasetMode } from '@/contexts/DatasetModeContext';
import { fetchChatLogs } from '@/services/chat/chatService';

export function useChatLogs(page = 1, status?: string, agentId?: string) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const { datasetId } = useDatasetMode();

  return useQuery({
    queryKey: ['chat', 'logs', page, role, status, agentId, datasetId],
    queryFn: () => fetchChatLogs(role, { page, pageSize: 25, status, agentId, datasetId }),
    enabled: Boolean(user),
  });
}
