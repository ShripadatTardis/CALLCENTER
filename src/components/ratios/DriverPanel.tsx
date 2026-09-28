import React from 'react';
import { RatioUnavailableState } from './RatioUnavailableState';
import type { RatioDriverResponseDto } from '@/types/ratio';

/** Spec §4.5 — reason/failure decomposition, only for ratios with a driverDimension. Never invents drivers the backend does not supply. */
export const DriverPanel: React.FC<{ drivers: RatioDriverResponseDto | undefined; isLoading: boolean; hasDriverDimension: boolean }> = ({
  drivers,
  isLoading,
  hasDriverDimension,
}) => {
  if (!hasDriverDimension) return null;
  return (
    <section>
      <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">Drivers</h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-4">Loading…</div>
      ) : drivers?.drivers && drivers.drivers.length > 0 ? (
        <div className="border border-border rounded-md bg-card/40 divide-y divide-border/60">
          {drivers.drivers.map((d) => (
            <div key={d.driverId} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-foreground">{d.label}</span>
              <span className="text-muted-foreground tabular-nums">{d.count} ({d.share.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      ) : (
        <RatioUnavailableState reason={drivers?.unavailableReason ?? 'Driver decomposition not yet instrumented.'} compact />
      )}
    </section>
  );
};
