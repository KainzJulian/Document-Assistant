import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const EVAL_DIR = path.resolve(__dirname, '../../docs/eval');

/**
 * Read the newest report of a kind.
 * @param kind - `summaries` or `rag`.
 * @returns Its text.
 */
function latestReport(kind: string): string {
  const files = fs.existsSync(EVAL_DIR) ? fs.readdirSync(EVAL_DIR).filter((f) => f.startsWith(`${kind}-`) && f.endsWith('.md')).sort() : [];
  expect(files, `No ${kind} report in docs/eval/. Run backend/eval/run_${kind === 'rag' ? 'rag' : 'summaries'}.py with your real model first (see docs/eval/README.md).`).not.toHaveLength(0);
  return fs.readFileSync(path.join(EVAL_DIR, files[files.length - 1]), 'utf-8');
}

// These two read the reports of the evaluation scripts, which need a real model and are run by hand (W8).
test('AC-2.3 the summary report meets both targets', () => {
  const report = latestReport('summaries');
  expect(report).not.toContain('BELOW TARGET');
  expect(report.match(/PASS/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
});

test('AC-3.3 the answer report reaches at least 85 percent correct', () => {
  const report = latestReport('rag');
  const match = /Answers correct: \*\*(\d+)%\*\*/.exec(report);
  expect(match, 'The report has no "Answers correct" line.').not.toBeNull();
  expect(Number(match?.[1])).toBeGreaterThanOrEqual(85);
});
