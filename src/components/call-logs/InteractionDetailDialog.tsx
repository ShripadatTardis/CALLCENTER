
import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Interaction, TranscriptEntry } from '@/types/interaction';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';

interface InteractionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  interaction: Interaction | null;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getSpeakerColor(speaker: string) {
  switch (speaker) {
    case 'customer':
      return 'bg-blue-100 text-blue-800';
    case 'ai':
      return 'bg-green-100 text-green-800';
    case 'agent':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getSentimentColor(sentiment?: string) {
  switch (sentiment?.toLowerCase()) {
    case 'positive':
      return 'text-green-600';
    case 'negative':
      return 'text-red-600';
    case 'neutral':
      return 'text-yellow-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Interaction Detail — expanded from the former TranscriptViewer per the
 * Session 2 plan §4/§5/§8: shows the full metadata set, a real audio
 * element when a recording exists, and reconciles the two transcript
 * sources (embedded call-data.detailed_transcript vs. the dedicated
 * GET /api/calls/session/{id} endpoint) via one clear rule.
 */
export const InteractionDetailDialog: React.FC<InteractionDetailDialogProps> = ({
  isOpen,
  onClose,
  interaction,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const isActive = interaction?.status === 'active';
  const needsLiveFetch = isActive || (interaction?.transcript?.length ?? 0) === 0;

  const liveTranscript = useInteractionTranscript(interaction?.interactionId, {
    enabled: isOpen && Boolean(interaction) && needsLiveFetch,
    poll: isOpen && isActive,
  });

  const transcript: TranscriptEntry[] = useMemo(() => {
    if (needsLiveFetch && liveTranscript.data?.transcript?.length) {
      return liveTranscript.data.transcript;
    }
    return interaction?.transcript ?? [];
  }, [needsLiveFetch, liveTranscript.data, interaction?.transcript]);

  const filteredTranscript = transcript.filter((entry) =>
    entry.text.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!interaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {interaction.callerName || interaction.phoneNumber} — {interaction.interactionId}
          </DialogTitle>
        </DialogHeader>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 bg-slate-50 p-4 rounded-lg text-sm">
          <div><span className="text-slate-500">Phone:</span> {interaction.phoneNumber}</div>
          <div><span className="text-slate-500">Agent:</span> {interaction.agentDisplayName ?? interaction.agentId ?? '—'}</div>
          <div><span className="text-slate-500">Direction:</span> {interaction.direction ?? '—'}</div>
          <div><span className="text-slate-500">Status:</span> {interaction.status}</div>
          <div><span className="text-slate-500">Duration:</span> {formatDuration(interaction.durationSeconds)}</div>
          <div><span className="text-slate-500">Outcome:</span> {interaction.outcome ?? '—'}</div>
          <div><span className="text-slate-500">FCR:</span> {interaction.fcr === undefined ? '—' : interaction.fcr ? 'Yes' : 'No'}</div>
          <div><span className="text-slate-500">Intent:</span> {interaction.intent ?? '—'}</div>
          <div>
            <span className="text-slate-500">Intent accuracy:</span>{' '}
            {interaction.intentAccuracy === undefined ? '—' : `${interaction.intentAccuracy.toFixed(0)}%`}
          </div>
          <div><span className="text-slate-500">Sentiment:</span> {interaction.sentiment ?? '—'}</div>
          <div>
            <span className="text-slate-500">Sentiment score:</span>{' '}
            {interaction.sentimentScore === undefined ? '—' : interaction.sentimentScore.toFixed(2)}
          </div>
          <div><span className="text-slate-500">Campaign:</span> {interaction.campaignName ?? '—'}</div>
          <div>
            <span className="text-slate-500">Authenticated:</span>{' '}
            {interaction.wasAuthenticated === null || interaction.wasAuthenticated === undefined
              ? 'N/A'
              : interaction.wasAuthenticated
                ? 'Yes'
                : 'No'}
          </div>
          <div><span className="text-slate-500">Escalation:</span> {interaction.escalation?.trigger ?? 'None'}</div>
          <div><span className="text-slate-500">Started:</span> {interaction.startTime}</div>
          <div className="col-span-2 md:col-span-4">
            <span className="text-slate-500">Summary:</span> {interaction.summary || 'No summary available'}
          </div>
          {interaction.tags && interaction.tags.length > 0 && (
            <div className="col-span-2 md:col-span-4 flex flex-wrap gap-1">
              {interaction.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Recording */}
        <div className="bg-slate-50 p-4 rounded-lg">
          {interaction.recording?.url ? (
            <audio controls className="w-full" src={interaction.recording.url}>
              Your browser does not support the audio element.
            </audio>
          ) : (
            <p className="text-sm text-slate-500">Recording not available for this interaction.</p>
          )}
        </div>

        {isActive && liveTranscript.isPollingCapped && (
          <p className="text-xs text-amber-600">
            This call is still active. Live updates have paused after 60s to avoid excessive
            polling — use Refresh below to check for the latest transcript.
          </p>
        )}

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            placeholder="Search transcript..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {needsLiveFetch && (
            <Button
              variant="outline"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
              onClick={() => liveTranscript.refetch()}
              disabled={liveTranscript.isFetching}
            >
              Refresh
            </Button>
          )}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-auto space-y-3">
          {liveTranscript.isLoading && needsLiveFetch && transcript.length === 0 ? (
            <p className="text-sm text-slate-500">Loading transcript…</p>
          ) : filteredTranscript.length === 0 ? (
            <p className="text-sm text-slate-500">No transcript available for this interaction.</p>
          ) : (
            filteredTranscript.map((entry, index) => (
              <div key={index} className="border-l-4 border-slate-200 pl-4 py-2">
                <div className="flex items-center space-x-2 mb-2">
                  <Badge className={getSpeakerColor(entry.speaker)}>{entry.speaker.toUpperCase()}</Badge>
                  <span className="text-sm text-slate-500">{entry.timestamp}</span>
                  {entry.sentiment && (
                    <span className={`text-xs ${getSentimentColor(entry.sentiment)}`}>{entry.sentiment}</span>
                  )}
                  {entry.confidence !== undefined && (
                    <span className="text-xs text-slate-400">{(entry.confidence * 100).toFixed(0)}% confidence</span>
                  )}
                </div>
                <p className="text-slate-800 leading-relaxed">
                  {searchTerm
                    ? entry.text
                        .split(new RegExp(`(${searchTerm})`, 'gi'))
                        .map((part, i) =>
                          part.toLowerCase() === searchTerm.toLowerCase() ? (
                            <mark key={i} className="bg-yellow-200">{part}</mark>
                          ) : (
                            part
                          ),
                        )
                    : entry.text}
                </p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
