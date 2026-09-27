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
         */
        escalated:
          "border-red-600/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15",
        warning:
          "border-amber-600/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/15",
        positive:
          "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15",
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
