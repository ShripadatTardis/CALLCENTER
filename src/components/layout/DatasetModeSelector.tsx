import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useDatasetMode } from '@/contexts/DatasetModeContext';

/**
 * Session 7.1 Part E — the app-wide dataset mode control, rendered in
 * ContextBar so it stays visible and its selection persists across
 * navigation (the context itself, not this component, is what actually
 * persists the selection — see DatasetModeContext.tsx).
 *
 * Hidden entirely for a viewer who cannot use TEST mode at all (no
 * `cma.evaluate` permission) — there is nothing useful for them to
 * select, and showing a disabled control for a mode they can never
 * reach would just be visual noise.
 */
export const DatasetModeSelector: React.FC = () => {
  const { mode, canUseTestMode, setMode } = useDatasetMode();

  if (!canUseTestMode) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={mode} onValueChange={(value) => setMode(value as 'normal' | 'test')}>
        <SelectTrigger uiSize="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">Normal POC Data</SelectItem>
          <SelectItem value="test">CMA Test Data (500)</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'test' && <Badge variant="warning">TEST DATA</Badge>}
    </div>
  );
};
