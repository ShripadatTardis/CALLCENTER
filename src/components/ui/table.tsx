import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  // Session 7.9 — hover/selected now source from the centralized
  // --table-row-hover-bg/--table-row-selected-bg CSS vars. The hover
  // value is CORRECTED, not just relocated: the prior `hover:bg-muted/50`
  // was this primitive's own default, never actually matched by any
  // real table (every real table hand-overrides it to `hover:bg-card`)
  // — see components.table.rowHoverBackground's schema comment for the
  // full citation. This default now reflects the real, dominant value.
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-[hsl(var(--table-row-hover-bg))] data-[state=selected]:bg-[hsl(var(--table-row-selected-bg))]",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      // VoiceForce design system (Phase 2B) — the dense operational
      // header/cell geometry (h-9/px-3, py-1.5/px-3) was already the de
      // facto standard, hand-typed as a per-page override on every table
      // screen (Call Logs, Agent Detail, Live View, AI Agents, Campaign
      // Detail). Formalized as the shared default here; per-page
      // overrides for these exact values are now redundant (harmless,
      // not required) rather than necessary. Text-transform/tracking is
      // deliberately NOT baked in here — that's a per-screen typography
      // choice (see src/lib/typography.ts `tableHeader`), applied only
      // where a screen opts in, so this shared default never silently
      // changes the look of every existing table-header consumer.
      // Session 7.9: now sourced from tables.header's CSS vars
      // (src/theme/schema.ts) instead of literal h-9/px-3 — same real
      // values, now centrally controlled.
      "h-[var(--table-header-height)] px-[var(--table-header-padding-x)] text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  // Session 7.9 — sourced from tables.rows.standard's CSS vars instead
  // of literal py-1.5/px-3 — same real value, centrally controlled.
  <td
    ref={ref}
    className={cn("py-[var(--table-row-standard-padding-y)] px-[var(--table-row-standard-padding-x)] align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
