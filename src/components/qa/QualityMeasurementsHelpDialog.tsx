import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { QA_PARAMETERS, type QaParameterCode } from '@/lib/qaParameters';

/**
 * Session 16.3.7 — reusable "Understanding Quality Measurements" reference.
 * Built from docs/MANUAL_QA_MEASUREMENT_CONTRACT.md (§4 canonical parameter
 * dictionary, §2 allowed values, §6 interaction-level fields excluded here
 * since this screen only shows the 9 turn/interaction-level evaluated
 * parameters) and docs/MANUAL_QA_QUALITY_FRAMEWORK.md (§2.1 dimensions, §3
 * measure kinds, §9/§10 Human-vs-Automated comparison context). Presentation
 * only — reuses QA_PARAMETERS' own displayName/dimension/directionality/
 * shortHelp rather than restating the dictionary, and does not alter any
 * ratio, eligibility, or persistence logic.
 *
 * Reusable by design: no page-specific wiring, takes only open/onOpenChange.
 * Currently triggered only from AutomatedQaInspector; Human QA Quality
 * Explorer and a future comparison dashboard can import this unchanged.
 */

const HIGHER_IS_BETTER_ORDER: QaParameterCode[] = [
  'context_continuity_rate',
  'followup_understanding_rate',
  'reference_resolution_accuracy',
  'task_progression_rate',
  'conversation_recovery_rate',
  'response_grounding_rate',
];

const LOWER_IS_BETTER_ORDER: QaParameterCode[] = [
  'unnecessary_clarification_rate',
  'repetition_loop_rate',
  'customer_correction_rate',
];

interface ParameterHelp {
  whatItMeasures: string;
  whenApplicable: string;
  successExample: string;
  failureExample: string;
  formula: string;
  note?: string;
}

// Content below mirrors docs/MANUAL_QA_MEASUREMENT_CONTRACT.md §4.1-4.9
// exactly (definition / applicable / numerator-denominator / examples) —
// not invented, not simplified in a way that changes meaning.
const PARAMETER_HELP: Record<QaParameterCode, ParameterHelp> = {
  context_continuity_rate: {
    whatItMeasures: 'Did the agent correctly retain and use relevant information already established earlier in the interaction?',
    whenApplicable: 'Any agent turn that is not that agent\'s first turn in the interaction — there is nothing to "carry forward" before a first turn.',
    successExample: 'Customer gives account last-4 digits in turn 2; agent correctly references "the account ending 4455" in turn 8 without re-asking.',
    failureExample: 'Customer already said "I already paid this EMI" in turn 4; agent asks "would you like to pay your EMI now?" in turn 9 as if it were never mentioned.',
    formula: 'PASS turns ÷ (PASS + FAIL) turns with a finding. N/A turns are excluded from both sides.',
  },
  followup_understanding_rate: {
    whatItMeasures: 'Did the agent correctly understand a customer\'s follow-up statement or question in relation to the preceding conversation? (Distinct from recognizing the customer\'s very first, initial intent.)',
    whenApplicable: 'Any agent turn responding to a customer turn that is not the first customer turn in the interaction.',
    successExample: 'Customer establishes a home-loan enquiry, later asks "when is the next payment?" — agent correctly answers about the home loan, not an unrelated product.',
    failureExample: 'Same follow-up, but the agent answers about a different loan on file.',
    formula: 'PASS turns ÷ (PASS + FAIL) turns with a finding.',
  },
  reference_resolution_accuracy: {
    whatItMeasures: 'Did the agent correctly resolve a contextual reference — "it," "that one," "second account," "this EMI" — to the right entity?',
    whenApplicable: 'Only agent turns responding to a customer turn that actually contains a genuine contextual reference. Most turns contain no such reference, so most turns are simply never assessed for this parameter.',
    successExample: 'Customer has two loans, asks "what\'s the balance on the second one?" — agent correctly answers about the second loan listed earlier.',
    failureExample: 'Same question, but the agent answers about the first loan instead.',
    formula: 'PASS turns ÷ (PASS + FAIL) turns with a finding.',
  },
  task_progression_rate: {
    whatItMeasures: 'Did the agent\'s response materially move the customer\'s stated objective toward completion? A response can be polite and linguistically correct while still failing this.',
    whenApplicable: 'Every substantive agent turn.',
    successExample: 'Customer asks to pay an EMI; agent provides the payment link and next step.',
    failureExample: 'Customer asks to pay an EMI; agent repeats "I understand you want to pay your EMI" without providing a next step.',
    formula: 'PASS turns ÷ (PASS + FAIL) turns with a finding.',
  },
  unnecessary_clarification_rate: {
    whatItMeasures: 'Did the agent ask for information or clarification that was already available, or not actually required at all?',
    whenApplicable: 'Only agent turns that ask or seek clarification. A turn that asks nothing is simply never assessed for this parameter.',
    successExample: 'Agent asks for a detail genuinely not yet provided (e.g. which of two accounts) — recorded as "no issue."',
    failureExample: 'Customer: "I want to check whether my EMI due on 15 October has been paid." Agent: "What would you like to know about your EMI?"',
    formula: 'ISSUE turns ÷ (ISSUE + NO_ISSUE) turns with a finding. Lower is better — the numerator here is the problem count, not the clean count.',
  },
  repetition_loop_rate: {
    whatItMeasures: 'Did the conversation unnecessarily repeat information, questions, or responses, or enter a non-progressing loop?',
    whenApplicable: 'Assessed once per reviewed interaction, not once per turn — a loop is a property of a span of turns, not of any single turn in isolation.',
    successExample: 'No repeated question/answer pair found across the interaction — recorded as "no issue" for the whole interaction.',
    failureExample: 'Agent asks "can I get your date of birth?" at turn 5 and again at turn 11, with no intervening reason (e.g. a dropped response) to re-ask.',
    formula: 'Reviewed interactions with ISSUE ÷ reviewed interactions with a finding (ISSUE + NO_ISSUE). Lower is better.',
    note: 'The displayed count reflects interactions, not turns, for this one parameter.',
  },
  customer_correction_rate: {
    whatItMeasures: 'Did the customer need to correct the agent? ("No, that\'s not what I said." / "I already told you." / "No, I mean my home loan.")',
    whenApplicable: 'Any customer turn — the reviewer reads it and decides whether it is actually a correction. Assessed on the customer\'s turn, not the agent\'s, since this is about what the customer said, used as evidence of an earlier agent misunderstanding.',
    successExample: 'No corrective customer turn found — recorded as "no issue."',
    failureExample: 'Customer: "No, I mean my home loan, not my car loan."',
    formula: 'Reviewed interactions containing an ISSUE finding ÷ eligible reviewed interactions. Lower is better.',
  },
  conversation_recovery_rate: {
    whatItMeasures: 'Where a recoverable misunderstanding or error occurred, did the agent correctly recover — acknowledge the correction, adopt the corrected information, and continue without repeating the same error?',
    whenApplicable: 'Only when a genuine recovery opportunity exists, typically right after a Customer Correction finding or an agent self-correction trigger. The default for every ordinary turn is "no opportunity," never a forced default on a turn with nothing to recover from.',
    successExample: 'Customer corrects "no, my home loan" → agent: "Apologies, let\'s go with your home loan — here\'s the balance."',
    failureExample: 'Same correction, but the agent continues discussing the car loan.',
    formula: 'SUCCESSFUL turns ÷ (SUCCESSFUL + UNSUCCESSFUL) turns with a finding.',
  },
  response_grounding_rate: {
    whatItMeasures: 'Where a factual response requires supporting evidence (a tool result, a knowledge/RAG source, account data, or an already-established conversation fact), is the response actually consistent with that evidence?',
    whenApplicable: 'Only agent turns making a factual, evidence-backed claim. A turn with no such claim is simply never assessed.',
    successExample: 'Agent states an EMI amount that matches the account data visible to the reviewer — GROUNDED.',
    failureExample: 'Agent states a due date that contradicts the visible account record — NOT_GROUNDED.',
    formula: 'GROUNDED turns ÷ (GROUNDED + NOT_GROUNDED) turns. CANNOT_VERIFY and N/A are both excluded from this ratio.',
    note: 'CANNOT_VERIFY is a distinct, intentionally common result — the claim should have evidence but none was visible to check it against. It means "we don\'t know," not "this failed," and it is never counted as a grounding failure.',
  },
};

const REFERENCE_ROWS: { code: QaParameterCode; meaning: string }[] = [
  ...HIGHER_IS_BETTER_ORDER.map((code) => ({ code, meaning: PARAMETER_HELP[code].whatItMeasures })),
  ...LOWER_IS_BETTER_ORDER.map((code) => ({ code, meaning: PARAMETER_HELP[code].whatItMeasures })),
];

function DirectionBadge({ code }: { code: QaParameterCode }) {
  const higher = QA_PARAMETERS[code].directionality === 'higher_better';
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] font-medium ${higher ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-700 dark:text-amber-400'}`}
    >
      {higher ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {higher ? 'Higher is better' : 'Lower is better'}
    </Badge>
  );
}

function ParameterAccordionItem({ code }: { code: QaParameterCode }) {
  const def = QA_PARAMETERS[code];
  const help = PARAMETER_HELP[code];
  return (
    <AccordionItem value={code}>
      <AccordionTrigger className="text-left text-[13px] py-2.5 hover:no-underline">
        <span className="flex flex-1 items-center gap-2 pr-2">
          <span className="font-semibold">{def.displayName}</span>
          <span className="text-[11px] text-muted-foreground">({def.dimension})</span>
          <DirectionBadge code={code} />
        </span>
      </AccordionTrigger>
      <AccordionContent className="text-[12px] text-muted-foreground space-y-2">
        <p><span className="font-medium text-foreground">What it measures: </span>{help.whatItMeasures}</p>
        <p><span className="font-medium text-foreground">When applicable: </span>{help.whenApplicable}</p>
        <p><span className="font-medium text-foreground">{def.directionality === 'higher_better' ? 'Success example: ' : 'Acceptable example: '}</span>{help.successExample}</p>
        <p><span className="font-medium text-foreground">{def.directionality === 'higher_better' ? 'Failure example: ' : 'Issue example: '}</span>{help.failureExample}</p>
        <p><span className="font-medium text-foreground">How it's calculated: </span>{help.formula}</p>
        {help.note && <p className="italic">{help.note}</p>}
      </AccordionContent>
    </AccordionItem>
  );
}

export function QualityMeasurementsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] w-[90vw] max-h-[85vh] p-0 flex flex-col gap-0 sm:rounded-lg">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-[16px]">Understanding Quality Measurements</DialogTitle>
          <DialogDescription className="text-[12px]">
            How each parameter below is defined, when it applies, and how its percentage is calculated. Automated QA evaluates the same nine parameters, against the same definitions, as Human QA — so the two are directly comparable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-[13px]">
          <section className="space-y-2">
            <p className="text-muted-foreground">
              These nine parameters are <span className="font-medium text-foreground">evaluated qualitative measures</span> — they require examining the conversation and its evidence, unlike direct measures (e.g. FCR, business outcome) that come straight from an authoritative source, or derived measures that are pure arithmetic over already-recorded facts. Each one traces back to specific conversation turns, never an unexplained overall score.
            </p>
            <p className="text-muted-foreground">
              Six parameters are <span className="font-medium text-emerald-700 dark:text-emerald-400">higher is better</span> (a bigger percentage means more turns passed) and three are <span className="font-medium text-amber-700 dark:text-amber-400">lower is better</span> (a bigger percentage means more turns had the problem — Unnecessary Clarification, Repetition/Loop, Customer Correction). The direction badge on every card and in this reference tells you which kind you're looking at before you read the number.
            </p>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold mb-2">Quick reference</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-[11.5px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left font-medium px-2.5 py-1.5 w-[22%]">Parameter</th>
                    <th className="text-left font-medium px-2.5 py-1.5 w-[16%]">Direction</th>
                    <th className="text-left font-medium px-2.5 py-1.5">What it checks</th>
                  </tr>
                </thead>
                <tbody>
                  {REFERENCE_ROWS.map(({ code, meaning }) => (
                    <tr key={code} className="border-t border-border">
                      <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{QA_PARAMETERS[code].displayName}</td>
                      <td className="px-2.5 py-1.5"><DirectionBadge code={code} /></td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold mb-1">Higher is better</h3>
            <Accordion type="multiple" className="rounded-md border border-border px-3">
              {HIGHER_IS_BETTER_ORDER.map((code) => <ParameterAccordionItem key={code} code={code} />)}
            </Accordion>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold mb-1">Lower is better</h3>
            <Accordion type="multiple" className="rounded-md border border-border px-3">
              {LOWER_IS_BETTER_ORDER.map((code) => <ParameterAccordionItem key={code} code={code} />)}
            </Accordion>
          </section>

          <section className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <h3 className="text-[12px] font-semibold">Reading "—", 0% and 100% correctly</h3>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">"— / No eligible population"</span> means no turn in this interaction had a finding row for that parameter at all — there was nothing to assess (e.g. no clarifying question was ever asked, so Unnecessary Clarification has nothing to measure). This is never shown as a fabricated 0% or 100%.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">0% or 100%</span> only appears once there is at least one eligible finding. 100% on a higher-is-better parameter, or 0% on a lower-is-better one, both mean every eligible turn was clean — not that the parameter didn't apply.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">CANNOT_VERIFY</span> (Response Grounding only) is a distinct result from N/A: N/A means no factual claim was made at all, while CANNOT_VERIFY means a claim was made but the evaluator had no way to check it against evidence. Both are excluded from the ratio, but for different reasons — a data-availability gap is never silently recorded as a pass.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Small sample sizes</span> are common per interaction — most parameters only have a handful of eligible turns in a single conversation, so one or two findings can swing a percentage from 0% to 100%. Treat a single interaction's percentages as evidence to review, not as a statistically stable rate; rates become more meaningful once aggregated across many interactions.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
