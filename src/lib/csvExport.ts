/**
 * Session 7 §15/§16 — one shared CSV export helper reused across every
 * Analytics tab, so export logic isn't duplicated per-tab (mirrors the
 * pattern already established for classification/grouping). Callers
 * pass already-computed, already-authorized rows — this file has no
 * fetch logic of its own and makes no authorization decisions.
 */
export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], headers: (keyof T & string)[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
