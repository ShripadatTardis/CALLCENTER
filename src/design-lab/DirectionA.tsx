import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  LayoutGrid, Phone, MessageSquare, Users, Megaphone, Star, Puzzle, Bot,
  BarChart3, Shield, ChevronRight, X, Menu,
} from 'lucide-react';
import { PILLARS, DEMO_CAMPAIGNS, CREATE_STEPS, DEMO_AGENT_CONTRACT, DEMO_OUTCOME_RULES } from './demoData';

const PILLAR_ICON: Record<string, React.ElementType> = {
  observe: LayoutGrid, control: Phone, operationalize: Megaphone, integrate: Puzzle,
  improve: Bot, measure: BarChart3, govern: Shield,
};

type View = 'campaigns' | 'create';

/**
 * DIRECTION A — Compact Enterprise.
 * Maximum density. Icon-only rail (52px) permanent; full nav is an
 * overlay flyout that never pushes the workspace. Minimal cards —
 * mostly rows, dividers and dense tables. Optimized for an operator
 * who already knows the product and wants the shortest path.
 */
export const DirectionA: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<View>('campaigns');
  const [step, setStep] = useState(0);

  return (
    <div className="flex h-screen w-full bg-white text-[13px] text-slate-800 relative overflow-hidden">
      {/* Permanent icon rail — ~52px */}
      <div className="flex flex-col items-center w-[52px] shrink-0 bg-slate-900 py-2 gap-1">
        <button
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          className="w-9 h-9 rounded flex items-center justify-center text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 mb-1"
        >
          <Menu size={18} />
        </button>
        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold mb-2" title="TARDIS VoiceForce — Banking & Financial Services">
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
              className={`w-9 h-9 rounded flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                p.active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {/* Overlay flyout nav — absolutely positioned, never pushes content */}
      {navOpen && (
        <>
          <button
            aria-label="Close navigation overlay"
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute left-[52px] top-0 h-full w-64 bg-white border-r shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div>
                <div className="text-sm font-bold leading-tight">TARDIS VoiceForce</div>
                <div className="text-[11px] text-slate-500">Banking &amp; Financial Services</div>
              </div>
              <button aria-label="Close" onClick={() => setNavOpen(false)} className="p-1 rounded hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-1" aria-label="Product navigation">
              {PILLARS.map((p) => (
                <div key={p.key} className="px-3 py-1.5">
                  <div className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${p.active ? 'text-blue-600' : 'text-slate-500'}`}>{p.label}</div>
                  {p.items.map((it) => (
                    <button
                      key={it}
                      className={`block w-full text-left px-2 py-1 rounded text-[13px] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                        it === 'Outbound Campaigns' ? 'bg-blue-50 text-blue-700 font-medium' : ''
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

      {/* Workspace — target ~90%+ of viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[44px] shrink-0 flex items-center justify-between px-3 border-b bg-white">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span>Operationalize</span>
            <ChevronRight size={12} />
            <span className="text-slate-900 font-medium">
              {view === 'campaigns' ? 'Outbound Campaigns' : 'Create Campaign'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-semibold">SC</div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {view === 'campaigns' ? <CampaignsA onCreate={() => { setView('create'); setStep(0); }} /> : <CreateA step={step} setStep={setStep} onExit={() => setView('campaigns')} />}
        </div>
      </div>
    </div>
  );
};

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-green-100 text-green-800', draft: 'bg-slate-100 text-slate-700',
  completed: 'bg-blue-100 text-blue-800', paused: 'bg-amber-100 text-amber-800', stopped: 'bg-red-100 text-red-800',
};

const CampaignsA: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <h1 className="text-base font-semibold">Outbound Campaigns</h1>
      <Button size="sm" onClick={onCreate}>New Campaign</Button>
    </div>
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="text-[11px] uppercase text-slate-500 border-b">
          <th className="py-1.5 font-medium">Name</th>
          <th className="py-1.5 font-medium">Status</th>
          <th className="py-1.5 font-medium">Call Agent</th>
          <th className="py-1.5 font-medium">Targets</th>
          <th className="py-1.5 font-medium">Attempted</th>
          <th className="py-1.5 font-medium">Reconciled</th>
          <th className="py-1.5 font-medium">Success rate</th>
        </tr>
      </thead>
      <tbody>
        {DEMO_CAMPAIGNS.map((c) => (
          <tr key={c.id} className="border-b hover:bg-slate-50">
            <td className="py-1.5 font-medium">{c.name}</td>
            <td className="py-1.5"><span className={`px-1.5 py-0.5 rounded text-[11px] ${STATUS_COLOR[c.status]}`}>{c.status}</span></td>
            <td className="py-1.5 text-slate-600">{c.agentName}</td>
            <td className="py-1.5 tabular-nums">{c.targetCount}</td>
            <td className="py-1.5 tabular-nums text-slate-600">{c.attempted}</td>
            <td className="py-1.5 tabular-nums text-slate-600">{c.reconciled} <span className="text-slate-500">({c.unclassified} unclassified)</span></td>
            <td className="py-1.5 tabular-nums">{c.successRate === null ? <span className="text-slate-500">—</span> : `${Math.round(c.successRate * 100)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CreateA: React.FC<{ step: number; setStep: (n: number) => void; onExit: () => void }> = ({ step, setStep, onExit }) => (
  <div className="max-w-3xl">
    <div className="flex items-center gap-1 mb-3 text-[12px]">
      {CREATE_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <button
            onClick={() => setStep(i)}
            className={`px-2 py-0.5 rounded ${i === step ? 'bg-blue-600 text-white font-medium' : i < step ? 'text-blue-700' : 'text-slate-500'}`}
          >
            {i + 1}. {s}
          </button>
          {i < CREATE_STEPS.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
        </React.Fragment>
      ))}
    </div>
    <StepBody step={step} />
    <div className="flex justify-between mt-3">
      <Button size="sm" variant="outline" onClick={() => (step === 0 ? onExit() : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
      {step < CREATE_STEPS.length - 1 && <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>}
    </div>
  </div>
);

export const StepBody: React.FC<{ step: number }> = ({ step }) => {
  if (step === 2) {
    return (
      <div className="border rounded p-3 text-[13px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{DEMO_AGENT_CONTRACT.agentName}</div>
            <div className="text-slate-500 font-mono text-[11px]">{DEMO_AGENT_CONTRACT.agentId}</div>
          </div>
          <Badge variant="outline" className="text-[11px]">Contract: Partial (legacy)</Badge>
        </div>
        <Separator className="my-2" />
        <p className="text-slate-500 text-[12px]">
          Expected inputs, expected outcomes and structured outputs are not currently exposed by Call Centre for
          this agent. The campaign uses the existing legacy Trigger Call contract.
        </p>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="border rounded p-3 text-[13px] space-y-2">
        <p className="text-slate-500 text-[12px]">
          Call Centre determines the actual call outcome. These rules map that authoritative outcome to campaign
          handling — VoiceForce never infers an outcome itself.
        </p>
        {DEMO_OUTCOME_RULES.map((r) => (
          <div key={r.priority} className="flex items-center justify-between border rounded px-2 py-1">
            <span className="font-mono text-[11px] text-slate-500">{r.matchField} = {r.matchValue}</span>
            <span>{r.resultLabel}</span>
            <Badge variant={r.isSuccess ? 'default' : 'outline'} className="text-[11px]">{r.isSuccess ? 'success' : 'not success'}</Badge>
          </div>
        ))}
      </div>
    );
  }
  if (step === 6) {
    return (
      <div className="border rounded p-3 text-[13px] space-y-1.5">
        <Row label="Campaign" value="October EMI Reminders" status="ready" />
        <Row label="Call Agent" value="EMI Reminder (emi-reminder-agent)" status="ready" />
        <Row label="Agent Contract" value="Partial / legacy — no expected-input metadata yet" status="info" />
        <Row label="Audience" value="240 targets — Customer 360 + CSV" status="ready" />
        <Row label="Input Mapping" value="No required agent inputs today" status="info" />
        <Row label="Outcome Policy" value="2 rules configured" status="ready" />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline">Save as Draft</Button>
          <Button size="sm">Launch Now</Button>
        </div>
      </div>
    );
  }
  return <div className="border rounded p-3 text-[13px] text-slate-500">{CREATE_STEPS[step]} — demo step body.</div>;
};

const Row: React.FC<{ label: string; value: string; status: 'ready' | 'info' | 'blocker' }> = ({ label, value, status }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500 w-32 shrink-0">{label}</span>
    <span className="flex-1">{value}</span>
    <span className={`text-[10px] uppercase font-semibold ${status === 'ready' ? 'text-green-700' : status === 'info' ? 'text-blue-700' : 'text-red-700'}`}>{status}</span>
  </div>
);
