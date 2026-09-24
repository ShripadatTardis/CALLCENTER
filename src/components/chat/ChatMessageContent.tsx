import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { parseChatMessage, type Block, type InlineNode } from '@/lib/chatMessageFormatting';

/**
 * Presentation-only renderer, shared by Chat Console and Chat Session
 * Detail (plan §11/§16) — the ONLY place a raw Chat message string gets
 * turned into markup. Never uses dangerouslySetInnerHTML. `text` is
 * rendered structurally only; "Copy raw" always copies `text` itself,
 * byte for byte.
 */

function renderInline(nodes: InlineNode[], keyPrefix: string): React.ReactNode {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case 'code':
        return (
          <code key={key} className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 text-sm font-mono break-words">
            {node.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all"
          >
            {node.value}
          </a>
        );
      case 'label':
        return (
          <strong key={key} className="font-semibold">
            {node.value}
          </strong>
        );
      case 'bulletSep':
        return (
          <span key={key} className="text-slate-400 mx-0.5" aria-hidden>
            •
          </span>
        );
      default:
        return null;
    }
  });
}

function renderBlock(block: Block, index: number): React.ReactNode {
  const key = `block-${index}`;
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={key} className="leading-relaxed whitespace-pre-wrap break-words">
          {block.lines.map((line, i) => (
            <React.Fragment key={`${key}-line-${i}`}>
              {i > 0 && <br />}
              {renderInline(line, `${key}-line-${i}`)}
            </React.Fragment>
          ))}
        </p>
      );
    case 'list':
      return (
        <ul key={key} className="list-disc pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={`${key}-item-${i}`} className="break-words">
              {renderInline(item, `${key}-item-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div key={key} className="space-y-1">
          {block.rows.map((row, r) => (
            <div key={`${key}-row-${r}`} className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
              {row.map((cell, c) => (
                <span key={`${key}-row-${r}-cell-${c}`} className="break-words">
                  {renderInline(cell, `${key}-row-${r}-cell-${c}`)}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    case 'code':
      return (
        <pre key={key} className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs overflow-x-auto">
          <code>{block.text}</code>
        </pre>
      );
    default:
      return null;
  }
}

interface ChatMessageContentProps {
  text: string;
  showCopyRaw?: boolean;
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({ text, showCopyRaw = true }) => {
  const blocks = useMemo(() => parseChatMessage(text), [text]);
  const [copied, setCopied] = useState(false);

  const handleCopyRaw = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — not
      // worth a full error state for a convenience action.
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">{blocks.map(renderBlock)}</div>
      {showCopyRaw && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyRaw}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? 'Copied' : 'Copy raw'}
        </Button>
      )}
    </div>
  );
};
