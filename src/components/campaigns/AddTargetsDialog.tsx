import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { parseTargetsCsv } from '@/hooks/campaigns/useImportTargets';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import type { ImportTargetRow } from '@/types/campaign';

interface AddTargetsDialogProps {
  campaignId: string;
  onClose: () => void;
}

/**
 * Session 12.7 §12 — Add Targets to an existing, already-launched
 * campaign. Reuses the EXACT same CSV parsing (parseTargetsCsv) as
 * campaign creation's own audience step — the identity-resolved
 * dedupe/customer-matching happens server-side in addTargets
 * (supabaseCampaignRepository.ts), same path as the initial import.
 */
export const AddTargetsDialog: React.FC<AddTargetsDialogProps> = ({ campaignId, onClose }) => {
  const actions = useCampaignActions(campaignId);
  const [rows, setRows] = useState<ImportTargetRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ customersCreated: number; customersMatched: number; rowsSkipped: number } | null>(null);

  const handleFileChange = async (file: File | null) => {
    setErrors([]);
    setResult(null);
    if (!file) {
      setRows([]);
      return;
    }
    try {
      const { rows: parsed, errors: parseErrors } = await parseTargetsCsv(file);
      setRows(parsed);
      setErrors(parseErrors);
    } catch (err) {
      setRows([]);
      setErrors([err instanceof Error ? err.message : 'Failed to parse CSV']);
    }
  };

  const handleSubmit = () => {
    actions.addTargets.mutateAsync({ id: campaignId, rows }).then((res) => setResult(res));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add targets</DialogTitle>
          <DialogDescription className="text-xs">
            Uses the same identity resolution as campaign creation — an existing customer is matched, not
            duplicated. New rows are tagged with one batch id for provenance.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="text-sm text-foreground space-y-1">
            <p>{result.customersCreated} new customer{result.customersCreated === 1 ? '' : 's'} created.</p>
            <p>{result.customersMatched} matched to an existing customer.</p>
            {result.rowsSkipped > 0 && <p className="text-amber-700 dark:text-amber-400">{result.rowsSkipped} row(s) skipped (missing phone).</p>}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-5 text-center bg-background/60">
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
            <input
              type="file"
              accept=".csv"
              onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
              className="text-xs text-foreground"
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              Columns: <code>name, phone, customer_reference</code> (optional).
            </p>
          </div>
        )}

        {errors.length > 0 && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {rows.length > 0 && !result && <p className="text-xs text-foreground">{rows.length} row(s) parsed and ready to add.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button disabled={rows.length === 0 || actions.addTargets.isPending} onClick={handleSubmit}>
              {actions.addTargets.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Add {rows.length || ''} target{rows.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
