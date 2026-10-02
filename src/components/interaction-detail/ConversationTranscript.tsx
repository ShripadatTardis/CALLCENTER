import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Copy, Check } from 'lucide-react';

/**
 * Shared Interaction Detail primitive — the "Conversation" section
 * (search, highlight, refresh, loading/error/empty states, per-turn
 * speaker treatment) extracted from Call Detail's own theme-aligned
 * rebuild so Chat Detail reuses the exact same search/highlight/scroll
 * behavior rather than a second, diverging implementation. Channel-
 * specific data (voice transcript entries vs. chat messages) is mapped
 * to this shared `ConversationEntry` shape by each caller — this
 * component itself has no voice/chat-specific knowledge.
 */
export interface ConversationEntry {
  key: string | number;
  speakerLabel: string;
  speakerClassName: string;
  /** Already formatted for display (callers format their own timestamp convention). */
  timestamp: string;
  text: string;
  /** Pre-formatted metadata fragments, e.g. ["neutral", "90% confidence"] — joined with " · ". Never fabricated by this component. */
  metaParts?: string[];
}

export interface ConversationTranscriptProps {
  entries: ConversationEntry[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showRefresh?: boolean;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  /** Shows a small "Copy raw" action under each turn's message (Chat Detail uses this; Call Detail does not). */
  enableCopyRaw?: boolean;
}

function highlightText(text: string, term: string): React.ReactNode {
  if (!term) return text;
  return text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="bg-amber-200 dark:bg-amber-500/30 dark:text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const CopyRawButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 p-1 -m-1 min-h-6"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard access denied — no crash, just no visual confirmation
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy raw'}</span>
    </button>
  );
};

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({
  entries,
  searchTerm,
  onSearchTermChange,
  searchPlaceholder = 'Search conversation…',
  isLoading,
  isError,
  onRetry,
  onRefresh,
  isRefreshing,
  showRefresh,
  loadingLabel = 'Loading conversation…',
  errorLabel = 'Could not load the conversation from the backend.',
  emptyLabel = 'No conversation available for this interaction.',
  enableCopyRaw,
}) => {
  const filtered = searchTerm
    ? entries.filter((e) => e.text.toLowerCase().includes(searchTerm.toLowerCase()))
    : entries;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-2 flex-shrink-0 mb-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversation</h3>
        <div className="flex items-center gap-1.5">
          {showRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              Refresh
            </Button>
          )}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
            <Input
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {isLoading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{loadingLabel}</p>
        ) : isError && entries.length === 0 ? (
          <div className="text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between gap-2 py-4">
            <span>{errorLabel}</span>
            {onRetry && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : filtered.length === 0 && searchTerm ? (
          <p className="text-sm text-muted-foreground py-4">No conversation entries match "{searchTerm}".</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((entry) => (
              <div key={entry.key} className="py-2">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                  <span className={`font-semibold tracking-wide ${entry.speakerClassName}`}>{entry.speakerLabel}</span>
                  <span className="text-muted-foreground">· {entry.timestamp}</span>
                  {(entry.metaParts ?? []).map((part, i) => (
                    <span key={i} className="text-muted-foreground">
                      · {part}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                  {highlightText(entry.text, searchTerm)}
                </p>
                {enableCopyRaw && <CopyRawButton text={entry.text} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
