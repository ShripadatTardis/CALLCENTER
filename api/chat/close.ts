import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore } from '../_voicebot.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';

/**
 * POST /api/chat/close — { chatSessionId } → marks the session closed
 * (plan §7/§9). The ONLY place a session's status ever changes — called
 * exclusively by an explicit "New Chat" action on a currently-open
 * session, never inferred automatically.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }

  noStore(res);

  const chatSessionId = (req.body as { chatSessionId?: string } | undefined)?.chatSessionId;
  if (!chatSessionId) {
    res.status(400).json({ detail: 'chatSessionId is required' });
    return;
  }

  await supabaseChatRepository.closeSession(chatSessionId);
  res.status(200).json({ ok: true });
});
