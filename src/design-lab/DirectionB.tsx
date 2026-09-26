import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  LayoutGrid, Phone, MessageSquare, Megaphone, Puzzle, Bot, BarChart3, Shield,
  ChevronDown, ChevronRight, Menu, X, Check,
} from 'lucide-react';
import { PILLARS, DEMO_CAMPAIGNS, CREATE_STEPS, DEMO_AGENT_CONTRACT, DEMO_OUTCOME_RULES } from './demoData';

const PILLAR_ICON: Record<string, React.ElementType> = {
  observe: LayoutGrid, control: Phone, operationalize: Megaphone, integrate: Puzzle,
  improve: Bot, measure: BarChart3, govern: Shield,
};

type View = 'campaigns' | 'create';

/**
 * DIRECTION B — Refined Workspace.
 * Apple-HIG-informed restraint: generous but not excessive breathing
 * room, calm typography, strong progressive disclosure. Create Campaign
 * uses a single-page accordion instead of a pill wizard — each stage
 * expands in place; completed stages collapse to a one-line summary.
 * Enterprise/web-native — no Apple chrome, icons or window styling.
 */
export const DirectionB: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<View>('campaigns');
  const [openSection, setOpenSection] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  return (
    <div className="flex h-screen w-full bg-white text-slate-800 relative overflow-hidden font-sans">
      <div className="flex flex-col items-center w-14 shrink-0 bg-white border-r py-3 gap-2">
        <button
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 mb-2"
        >
          <Menu size={17} />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-[10px] font-semibold mb-1" title="TARDIS VoiceForce">
          TAR
        </div>
        {PILLARS.map((p) => {
          const Icon = PILLAR_ICON[p.key];
          return (
            <button
              key={p.key}
              title={p.label}
              aria-label={p.label}
              onClick={() => setNavOpen(true)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                p.active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {navOpen && (
        <>
          <button aria-label="Close navigation overlay" className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-40" onClick={() => setNavOpen(false)} />
          <div className="absolute left-14 top-0 h-full w-72 bg-white border-r shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-[15px] font-semibold">VoiceForce</div>
                <div className="text-[12px] text-slate-500">Banking &amp; Financial Services</div>
              </div>
              <button aria-label="Close" onClick={() => setNavOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                <X size={15} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Product navigation">
              {PILLARS.map((p) => (
                <div key={p.key} className="mb-4">
                  <div className={`px-2 text-[11px] font-medium uppercase tracking-wider mb-1.5 ${p.active ? 'text-slate-900' : 'text-slate-500'}`}>{p.label}</div>
                  {p.items.map((it) => (
                    <button
                      key={it}
                      className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-[14px] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                        it === 'Outbound Campaigns' ? 'bg-slate-100 font-medium' : 'text-slate-600'
                      }`}
                    >
                      {it}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-slate-100">
          <div className="text-[13px] text-slate-500">
            Operationalize <span className="mx-1.5">·</span>
            <span className="text-slate-900 font-medium">{view === 'campaigns' ? 'Outbound Campaigns' : 'Create Campaign'}</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-medium text-slate-600">SC</div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {view === 'campaigns' ? (
            <CampaignsB onCreate={() => { setView('create'); setOpenSection(0); setMaxReached(0); }} />
          ) : (
            <CreateB openSection={openSection} setOpenSection={setOpenSection} maxReached={maxReached} setMaxReached={setMaxReached} onExit={() => setView('campaigns')} />
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Running', draft: 'Draft', completed: 'Completed', paused: 'Paused', stopped: 'Stopped',
};

const CampaignsB: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div className="max-w-5xl">
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Outbound Campaigns</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">{DEMO_CAMPAIGNS.length} campaigns</p>
      </div>
      <Button onClick={onCreate}>New Campaign</Button>
    </div>
    <div className="divide-y">
      {DEMO_CAMPAIGNS.map((c) => (
        <div key={c.id} className="flex items-center justify-between py-3.5">
          <div>
            <div className="text-[14px] font-medium">{c.name}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">{c.agentName} · {c.targetCount} targets</div>
          </div>
          <div className="flex items-center gap-8 text-[13px]">
            <div className="text-right">
              <div className="text-slate-500">{c.reconciled}/{c.attempted} reconciled</div>
              <div className="text-slate-500 text-[12px]">{c.unclassified} unclassified</div>
            </div>
            <div className="w-16 text-right tabular-nums text-slate-700">
              {c.successRate === null ? <span className="text-slate-300">—</span> : `${Math.round(c.successRate * 100)}%`}
            </div>
            <span className="text-[12px] text-slate-500 w-20">{STATUS_LABEL[c.status]}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const CreateB: React.FC<{
  openSection: number; setOpenSection: (n: number) => void;
  maxReached: number; setMaxReached: (n: number) => void; onExit: () => void;
}> = ({ openSection, setOpenSection, maxReached, setMaxReached, onExit }) => {
  const advance = () => {
    const next = Math.min(openSection + 1, CREATE_STEPS.length - 1);
    setOpenSection(next);
    setMaxReached(Math.max(maxReached, next));
  };
  return (
    <div className="max-w-2xl">
      <button onClick={onExit} className="text-[13px] text-slate-500 hover:text-slate-700 mb-3">&larr; Cancel</button>
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">Set up a new outbound call campaign</h1>
      <div className="space-y-1">
        {CREATE_STEPS.map((s, i) => {
          const done = i < openSection || (i <= maxReached && i !== openSection);
          const isOpen = i === openSection;
          const reachable = i <= maxReached;
          return (
            <div key={s} className="border-b border-slate-100 last:border-0">
              <button
                onClick={() => reachable && setOpenSection(i)}
                disabled={!reachable}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 py-3 text-left disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                  done ? 'bg-slate-900 text-white' : isOpen ? 'border-2 border-slate-900' : 'border border-slate-300 text-slate-300'
                }`}>
                  {done ? <Check size={11} /> : i + 1}
                </span>
                <span className={`text-[14px] flex-1 ${isOpen ? 'font-medium' : reachable ? 'text-slate-600' : 'text-slate-300'}`}>{s}</span>
                {isOpen ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-200" />}
              </button>
              {isOpen && (
                <div className="pb-4 pl-8">
                  <StepBodyB step={i} />
                  <div className="flex gap-2 mt-3">
                    {i < CREATE_STEPS.length - 1 && <Button size="sm" onClick={advance}>Continue</Button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StepBodyB: React.FC<{ step: number }> = ({ step }) => {
  if (step === 2) {
    return (
      <div className="text-[13px]">
        <div className="flex items-center justify-between">
          <span className="font-medium">{DEMO_AGENT_CONTRACT.agentName}</span>
          <Badge variant="outline" className="text-[11px] font-normal">Partial contract (legacy)</Badge>
        </div>
        <p className="text-slate-500 mt-1.5 leading-relaxed">
          Expected inputs and outcomes aren&apos;t exposed by Call Centre for this agent yet. This campaign uses
          the existing legacy call contract — nothing about this campaign is broken.
        </p>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="text-[13px] space-y-2.5">
        <p className="text-slate-500 leading-relaxed">
          Call Centre decides the actual outcome of every call. These rules translate that outcome into what
          VoiceForce does next — success, follow-up, retry.
        </p>
        {DEMO_OUTCOME_RULES.map((r) => (
          <div key={r.priority} className="flex items-center justify-between text-slate-600">
            <span>When <span className="font-mono text-[12px] text-slate-500">{r.matchField} = {r.matchValue}</span></span>
            <span className="font-medium text-slate-900">{r.resultLabel}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step === 6) {
    return (
      <div className="text-[13px] space-y-2">
        <ReviewRow label="Campaign" value="October EMI Reminders" tone="ready" />
        <ReviewRow label="Call Agent" value="EMI Reminder" tone="ready" />
        <ReviewRow label="Agent Contract" value="Partial — legacy Trigger Call contract" tone="info" />
        <ReviewRow label="Audience" value="240 targets" tone="ready" />
        <ReviewRow label="Outcome Policy" value="2 rules configured" tone="ready" />
        <Separator className="my-3" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm">Save as Draft</Button>
          <Button size="sm">Launch Now</Button>
        </div>
      </div>
    );
  }
  return <p className="text-[13px] text-slate-500">Demo step body for {CREATE_STEPS[step]}.</p>;
};

const ReviewRow: React.FC<{ label: string; value: string; tone: 'ready' | 'info' | 'blocker' }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500">{label}</span>
    <span className="flex items-center gap-2">
      {value}
      <span className={`w-1.5 h-1.5 rounded-full ${tone === 'ready' ? 'bg-green-500' : tone === 'info' ? 'bg-blue-400' : 'bg-red-500'}`} />
    </span>
  </div>
);
