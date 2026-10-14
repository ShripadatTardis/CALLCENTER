import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        /**
         * Session 11.1 XYZ — corporate semantic status language (see
         * docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md). Restrained
         * tinted-outline treatment for ordinary business exceptions/states,
         * reserving `destructive` (solid saturated red) for genuine
         * technical failure/error/destructive-action semantics only.
         * Opt-in — existing `destructive`/`default`/`secondary`/`outline`
         * usage elsewhere in the product is completely unaffected.
         *
         * Session 7.8 — these four variants now source their colors from
         * the generated `--status-{role}-{text,fill,border}` CSS custom
         * properties (src/theme/schema.ts's `color.semantic.*`) instead
         * of literal Tailwind color classes, so changing the central
         * config now changes every consumer of these variants. The
         * real values are unchanged from before this session (same
         * red/amber/emerald hex/rgb, same light+dark pairs) — the one
         * intentional, documented simplification: the previous
         * `hover:bg-{color}-500/15` (a slightly more saturated fill on
         * hover) now reuses the same fill token as the resting state,
         * since no second "hover fill" token exists in the config and
         * introducing one for a one-step opacity nuance wasn't judged
         * worth the added surface.
         */
        escalated:
          "border-[var(--status-negative-border)] bg-[var(--status-negative-fill)] text-[var(--status-negative-text)] hover:bg-[var(--status-negative-fill)]",
        warning:
          "border-[var(--status-caution-border)] bg-[var(--status-caution-fill)] text-[var(--status-caution-text)] hover:bg-[var(--status-caution-fill)]",
        positive:
          "border-[var(--status-positive-border)] bg-[var(--status-positive-fill)] text-[var(--status-positive-text)] hover:bg-[var(--status-positive-fill)]",
        /** New in Session 7.8 — "Pending/Open"/"Information/Running".
         * See color.semantic.pending in the config for the real-value
         * citation (no prior Badge variant covered this concept). */
        pending:
          "border-[var(--status-pending-border)] bg-[var(--status-pending-fill)] text-[var(--status-pending-text)] hover:bg-[var(--status-pending-fill)]",
        /** New in Session 7.10.1 — "Inactive/Neutral" (e.g. `queued`,
         * `draft`). See color.semantic.neutral in the config for the
         * real-value citation. */
        neutral:
          "border-[var(--status-neutral-border)] bg-[var(--status-neutral-fill)] text-[var(--status-neutral-text)] hover:bg-[var(--status-neutral-fill)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
