import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentInputField, CallAgentContract } from '@/types/campaign';
import { coerceInputValue, isFieldSatisfied, type AgentInputValues } from '@/lib/agentContractInputs';

/**
 * Session 13.3 — shared, contract-driven direct-value-entry form.
 * Consumes a real `CallAgentContract` (the exact Session 12.4 shape
 * Campaign Configuration's mapping UI and Agent Detail's read-only view
 * already use — see src/lib/campaignAgentContract.ts) and the caller's
 * current values, and renders one appropriate control per declared
 * input field — never a hardcoded EMI (or any other agent) layout.
 *
 * Renders nothing when the contract declares zero input fields (§11) —
 * callers should simply mount this unconditionally; there is no empty
 * "Agent Inputs" shell to guard against separately.
 *
 * Campaign Configuration does NOT use this component — its workflow
 * (mapping a bulk CSV/Customer360 column to a field, not typing one
 * direct value) is fundamentally different and already has its own
 * mapping controls (§15).
 */

function inputControl(
  field: AgentInputField,
  value: unknown,
  onChange: (value: unknown) => void,
  invalid: boolean,
  descId: string | undefined,
  errorId: string | undefined,
): React.ReactNode {
  const stringValue = value === undefined || value === null ? '' : String(value);

  const id = `agent-input-${field.fieldCode}`;
  const describedBy = [descId, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  if (field.allowedValues && field.allowedValues.length > 0) {
    return (
      <Select value={stringValue} onValueChange={(v) => onChange(v)}>
        <SelectTrigger
          id={id}
          aria-required={field.required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`h-8 text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        >
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {field.allowedValues.map((v) => (
            <SelectItem key={v} value={v} className="text-xs">
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.dataType === 'boolean') {
    return (
      <div className="h-8 flex items-center">
        <Checkbox
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
          aria-required={field.required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      </div>
    );
  }

  if (field.dataType === 'date') {
    return (
      <Input
        id={id}
        type="date"
        value={stringValue}
        onChange={(e) => onChange(coerceInputValue(field, e.target.value))}
        aria-required={field.required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`h-8 text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
    );
  }

  if (field.dataType === 'integer' || field.dataType === 'decimal') {
    return (
      <Input
        id={id}
        type="number"
        step={field.dataType === 'integer' ? '1' : 'any'}
        value={stringValue}
        onChange={(e) => onChange(coerceInputValue(field, e.target.value))}
        aria-required={field.required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`h-8 text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
    );
  }

  // Fallback — covers 'string' and any future/unrecognized data_type
  // (§3: never assume the declared type set is complete; render as free
  // text rather than silently dropping the field).
  return (
    <Input
      id={id}
      type="text"
      value={stringValue}
      placeholder={field.format || undefined}
      onChange={(e) => onChange(coerceInputValue(field, e.target.value))}
      aria-required={field.required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={`h-8 text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
    />
  );
}

export const AgentContractInputs: React.FC<{
  contract: CallAgentContract | null;
  values: AgentInputValues;
  onChange: (fieldCode: string, value: unknown) => void;
  /** Shows per-field required-but-empty state — callers typically set this only after a submit attempt, not on first render. */
  showValidation?: boolean;
}> = ({ contract, values, onChange, showValidation }) => {
  const fields = contract?.expectedInputFields ?? [];
  if (fields.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent Inputs</div>
      <div className="flex flex-wrap gap-x-3 gap-y-2.5">
        {fields.map((field) => {
          const invalid = Boolean(showValidation) && !isFieldSatisfied(field, values[field.fieldCode]);
          const descId = field.description ? `agent-input-${field.fieldCode}-desc` : undefined;
          const errorId = `agent-input-${field.fieldCode}-error`;
          return (
            <div key={field.fieldCode} className="space-y-1 w-44 flex-shrink-0">
              <Label htmlFor={`agent-input-${field.fieldCode}`} className="text-xs text-muted-foreground flex items-baseline gap-1">
                <span className="truncate" title={field.displayName}>{field.displayName}</span>
                {field.required && <span className="text-destructive">*</span>}
              </Label>
              {inputControl(field, values[field.fieldCode], (v) => onChange(field.fieldCode, v), invalid, descId, errorId)}
              {field.description && (
                <p id={descId} className="text-[10px] text-muted-foreground leading-tight" title={field.description}>
                  {field.description}
                </p>
              )}
              {invalid && <p id={errorId} className="text-xs text-destructive">Required</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
