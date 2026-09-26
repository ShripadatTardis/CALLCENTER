import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  LayoutGrid, Phone, Megaphone, Puzzle, Bot, BarChart3, Shield,
  Menu, X, Circle, AlertTriangle,
} from 'lucide-react';
import { PILLARS, DEMO_CAMPAIGNS, CREATE_STEPS, DEMO_AGENT_CONTRACT, DEMO_OUTCOME_RULES } from './demoData';

const PILLAR_ICON: Record<string, React.ElementType> = {
  observe: LayoutGrid, control: Phone, operationalize: Megaphone, integrate: Puzzle,
  improve: Bot, measure: BarChart3, govern: Shield,
};

type View = 'campaigns' | 'create';

/**
 * DIRECTION C — Operations Command Centre.
 * Built for someone actively running campaigns, not casually browsing.
 * Strong status visibility (live progress bars, unresolved counts up
 * front), master/detail Create Campaign (a stage list + a detail panel,
 * both inside the workspace — not permanent chrome), balanced density.
 */
export const DirectionC: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<View>('campaigns');
  const [activeStep, setActiveStep] = useState(0);

  const running = DEMO_CAMPAIGNS.filter((c) => c.status === 'running').length;
  const totalUnclassified = DEMO_CAMPAIGNS.reduce((s, c) => s + c.unclassified, 0);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="flex flex-col items-center w-[52px] shrink-0 bg-slate-900 py-2 gap-1 border-r border-slate-800">
        <button
          aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}
          className="w-9 h-9 rounded flex items-center justify-center text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 mb-1"
        >
          <Menu size={18} />
        </button>
        <div className="w-8 h-8 rounded bg-cyan-600 flex items-center justify-center text-white text-[10px] font-bold mb-2" title="TARDIS VoiceForce">TAR</div>
        {PILLARS.map((p) => {
          const Icon = PILLAR_ICON[p.key];
          return (
            <button key={p.key} title={p.label} aria-label={p.label} onClick={() => setNavOpen(true)}
              className={`w-9 h-9 rounded flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                p.active ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}>
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {navOpen && (
        <>
          <button aria-label="Close navigation overlay" className="fixed inset-0 bg-black/40 z-40" onClick={() => setNavOpen(false)} />
          <div className="absolute left-[52px] top-0 h-full w-64 bg-slate-900 border-r border-slate-800 shadow-2xl z-50 flex flex-col text-slate-100">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <div>
                <div className="text-sm font-bold">VoiceForce</div>
                <div className="text-[11px] text-slate-400">Banking &amp; Financial Services</div>
              </div>
              <button aria-label="Close" onClick={() => setNavOpen(false)} className="p-1 rounded hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-1" aria-label="Product navigation">
              {PILLARS.map((p) => (
                <div key={p.key} className="px-3 py-1.5">
                  <div className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${p.active ? 'text-cyan-400' : 'text-slate-500'}`}>{p.label}</div>
                  {p.items.map((it) => (
                    <button key={it} className={`block w-full text-left px-2 py-1 rounded text-[13px] hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                      it === 'Outbound Campaigns' ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-300'
                    }`}>{it}</button>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-11 shrink-0 flex items-center justify-between px-3 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-4 text-[12px]">
            <span className="text-slate-400">Operationalize / <span className="text-white font-medium">{view === 'campaigns' ? 'Outbound Campaigns' : 'Create Campaign'}</span></span>
            <span className="flex items-center gap-1 text-green-400"><Circle size={7} fill="currentColor" /> {running} running</span>
            {totalUnclassified > 0 && (
              <span className="flex items-center gap-1 text-amber-400"><AlertTriangle size={12} /> {totalUnclassified} unclassified</span>
            )}
          </div>
          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">SC</div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {view === 'campaigns' ? (
            <CampaignsC onCreate={() => { setView('create'); setActiveStep(0); }} />
          ) : (
            <CreateC activeStep={activeStep} setActiveStep={setActiveStep} onExit={() => setView('campaigns')} />
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS_DOT: Record<string, string> = {
  running: 'text-green-400', draft: 'text-slate-500', completed: 'text-blue-400', paused: 'text-amber-400', stopped: 'text-red-400',
};

const CampaignsC: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-[15px] font-semibold text-white">Outbound Campaigns</h1>
      <Button size="sm" onClick={onCreate}>New Campaign</Button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {DEMO_CAMPAIGNS.map((c) => {
        const pct = c.targetCount ? Math.round((c.attempted / c.targetCount) * 100) : 0;
        return (
          <div key={c.id} className="border border-slate-800 rounded-md p-3 bg-slate-900/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-white">{c.name}</span>
              <Circle size={8} className={STATUS_DOT[c.status]} fill="currentColor" />
            </div>
            <div className="text-[11px] text-slate-400 mb-2">{c.agentName} · {c.targetCount} targets</div>
            <Progress value={pct} className="h-1.5 mb-1.5" />
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{c.attempted}/{c.targetCount} attempted</span>
              <span>{c.unclassified > 0 && <span className="text-amber-400">{c.unclassified} unclassified</span>}</span>
              <span className="text-slate-200 tabular-nums">{c.successRate === null ? '—' : `${Math.round(c.successRate * 100)}%`}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const CreateC: React.FC<{ activeStep: number; setActiveStep: (n: number) => void; onExit: () => void }> = ({ activeStep, setActiveStep, onExit }) => (
  <div className="flex gap-4 h-full">
    <div className="w-48 shrink-0">
      <button onClick={onExit} className="text-[12px] text-slate-400 hover:text-white mb-2">&larr; Cancel</button>
      <div className="space-y-0.5">
        {CREATE_STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setActiveStep(i)}
            className={`w-full text-left px-2 py-1.5 rounded text-[12px] flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              i === activeStep ? 'bg-cyan-600 text-white' : i < activeStep ? 'text-cyan-300' : 'text-slate-500'
            }`}
          >
            <span className="w-4 text-center">{i < activeStep ? '✓' : i + 1}</span>{s}
          </button>
        ))}
      </div>
    </div>
    <div className="flex-1 border border-slate-800 rounded-md p-4 bg-slate-900/40 min-w-0">
      <StepBodyC step={activeStep} />
      <div className="flex justify-end gap-2 mt-4">
        {activeStep < CREATE_STEPS.length - 1 && <Button size="sm" onClick={() => setActiveStep(activeStep + 1)}>Next</Button>}
      </div>
    </div>
  </div>
);

const StepBodyC: React.FC<{ step: number }> = ({ step }) => {
  if (step === 2) {
    return (
      <div className="text-[13px] text-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">{DEMO_AGENT_CONTRACT.agentName}</span>
          <Badge variant="outline" className="text-[11px] border-slate-700 text-slate-300">Partial contract (legacy)</Badge>
        </div>
        <Separator className="my-2 bg-slate-800" />
        <p className="text-slate-400 text-[12px] leading-relaxed">
          Expected inputs and outcomes aren&apos;t exposed by Call Centre for this agent yet. This campaign runs on
          the existing legacy Trigger Call contract.
        </p>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="text-[13px] space-y-2 text-slate-200">
        <p className="text-slate-400 text-[12px] leading-relaxed">
          Call Centre determines the real outcome of every call. These deterministic rules decide what VoiceForce
          does with it — no AI interpretation happens here.
        </p>
        {DEMO_OUTCOME_RULES.map((r) => (
          <div key={r.priority} className="flex items-center justify-between border border-slate-800 rounded px-2 py-1.5">
            <span className="font-mono text-[11px] text-slate-400">{r.matchField} = {r.matchValue}</span>
            <span>{r.resultLabel}</span>
            <Badge variant={r.isSuccess ? 'default' : 'outline'} className="text-[11px]">{r.isSuccess ? 'success' : 'not success'}</Badge>
          </div>
        ))}
      </div>
    );
  }
  if (step === 6) {
    return (
      <div className="text-[13px] space-y-2 text-slate-200">
        <RowC label="Campaign" value="October EMI Reminders" tone="ready" />
        <RowC label="Call Agent" value="EMI Reminder" tone="ready" />
        <RowC label="Agent Contract" value="Partial — legacy contract" tone="info" />
        <RowC label="Audience" value="240 targets" tone="ready" />
        <RowC label="Outcome Policy" value="2 rules configured" tone="ready" />
        <Separator className="my-3 bg-slate-800" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm">Save as Draft</Button>
          <Button size="sm">Launch Now</Button>
        </div>
      </div>
    );
  }
  return <p className="text-[13px] text-slate-400">Demo step body for {CREATE_STEPS[step]}.</p>;
};

const RowC: React.FC<{ label: string; value: string; tone: 'ready' | 'info' | 'blocker' }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-400">{label}</span>
    <span className="flex items-center gap-2">{value}<Circle size={7} fill="currentColor" className={tone === 'ready' ? 'text-green-400' : tone === 'info' ? 'text-blue-400' : 'text-red-400'} /></span>
  </div>
);
