import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * Shared Interaction Detail primitive — same visual recipe as
 * SectionCard (rounded-md border bg-card, uppercase muted label), but
 * collapsible like AgentContractSection's established disclosure
 * pattern. Session 15.3 — Call Summary/Agent Outcome were previously
 * always-expanded SectionCards competing with Agent Contract and
 * Conversation for a fixed dialog height; making them collapsible lets
 * a viewer reclaim room for whichever section they actually need
 * without the dialog growing unbounded. Defaults collapsed, matching
 * Agent Contract's own default — nothing here is lost, only one click
 * further away.
 */
export const CollapsibleSectionCard: React.FC<{
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, children, action, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex-shrink-0">
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
            aria-expanded={open}
            aria-controls={panelId}
          >
            <span className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
            </span>
            {action}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={panelId}>
          <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
