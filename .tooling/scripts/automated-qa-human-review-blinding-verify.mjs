// Session 16.3 — brief §5/§18: a Human QA reviewer must remain blind to
// automated judgments while conducting an independent review, enforced
// through the workflow (structurally — separate pages/components), not
// merely a hidden button. This is a cheap, deterministic source-level
// guard: Human QA's review workspace (QaReviewDialog.tsx, the ONLY
// place a reviewer conducts a Human QA review) must never import or
// reference anything from the Automated QA surface.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

let pass = 0, fail = 0;
function assertTrue(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? pass++ : fail++;
}

const qaReviewDialogSource = readFileSync(join(repoRoot, 'src/components/qa/QaReviewDialog.tsx'), 'utf8');
assertTrue(
  'QaReviewDialog.tsx (the Human QA review workspace) never imports or references AutomatedQa',
  !/automatedqa/i.test(qaReviewDialogSource),
);

const qaReviewPageSource = readFileSync(join(repoRoot, 'src/pages/QAReview.tsx'), 'utf8');
assertTrue(
  'the "Run Automated" trigger is a separate action, never passed into QaReviewDialog\'s own props',
  !/<QaReviewDialog[^>]*automated/is.test(qaReviewPageSource),
);

const automatedInspectorSource = readFileSync(join(repoRoot, 'src/pages/AutomatedQaInspector.tsx'), 'utf8');
assertTrue(
  'Automated QA Inspector never imports QaReviewDialog (stays its own surface, never embeds the Human review workspace)',
  !/^import .*QaReviewDialog/m.test(automatedInspectorSource),
);

const evaluatorSource = readFileSync(join(repoRoot, 'src/server/qa/automatedQaEvaluator.ts'), 'utf8');
const promptSource = readFileSync(join(repoRoot, 'src/lib/automatedQaPrompt.ts'), 'utf8');
assertTrue(
  'the evaluation orchestrator never touches qa_reviews/qa_findings or any Human QA RPC',
  !/qa_review|qa_finding|call_center_qa_/i.test(evaluatorSource) && !/qa_review|qa_finding|call_center_qa_/i.test(promptSource),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
