import { useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { campaignsKeys } from './useCampaigns';
import { importCampaignTargets } from '@/services/campaigns/campaignsService';
import type { ImportTargetRow } from '@/types/campaign';

const KNOWN_COLUMNS = new Set(['name', 'phone', 'customer_reference']);

/**
 * Parses a CSV file client-side (papaparse, plan §4 item 5/§13), then
 * POSTs the rows as JSON — the server performs Customer 360
 * resolve-or-create (plan §5); the browser never resolves identity
 * itself.
 */
export function parseTargetsCsv(file: File): Promise<{ rows: ImportTargetRow[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors = results.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`);
        const rows: ImportTargetRow[] = results.data
          .filter((row) => row.phone && row.phone.trim().length > 0)
          .map((row) => {
            const sourceAttributes: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row)) {
              if (!KNOWN_COLUMNS.has(key) && value) sourceAttributes[key] = value;
            }
            if (row.customer_reference) sourceAttributes.customerReference = row.customer_reference;
            return { name: row.name || null, phone: row.phone.trim(), sourceAttributes };
          });
        resolve({ rows, errors });
      },
      error: (err) => reject(err),
    });
  });
}

export function useImportTargets(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ImportTargetRow[]) => importCampaignTargets(campaignId as string, rows),
    onSuccess: () => {
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
        queryClient.invalidateQueries({ queryKey: campaignsKeys.targets(campaignId) });
      }
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
    },
  });
}
