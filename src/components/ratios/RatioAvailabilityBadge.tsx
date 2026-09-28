import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { RatioAvailability } from '@/types/ratio';

/**
 * Availability must be visible but visually restrained (spec §11) —
 * reuses the existing S1 Badge variants
 * (docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md §23), no new colors.
 */
const CONFIG: Record<RatioAvailability, { label: string; variant: 'positive' | 'secondary' | 'warning' | 'outline' }> = {
  direct: { label: 'Direct', variant: 'positive' },
  derived: { label: 'Derived', variant: 'secondary' },
  partial: { label: 'Partial', variant: 'warning' },
  backend_gap: { label: 'Not yet instrumented', variant: 'outline' },
};

export const RatioAvailabilityBadge: React.FC<{ availability: RatioAvailability; className?: string }> = ({ availability, className }) => {
  // Defensive: never crash on an unrecognized/malformed availability value
  // (e.g. a non-JSON response reaching here as a raw string under local
  // dev without a live /api/* function) — fall back to the safest,
  // least-claiming state instead.
  const config = CONFIG[availability] ?? CONFIG.backend_gap;
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
};
