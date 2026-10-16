import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        // Session 16.5.1 (HIG gate fix) — the semantic "positive/submitted"
        // outline treatment, previously only expressed via Badge's own
        // `positive` variant. Several call sites (e.g. a review's "already
        // submitted" action button) need the same semantic distinction on
        // a Button, but had no token-driven option and fell back to literal
        // `emerald-*` Tailwind classes — exactly what ui-centralization.md
        // Rule 2 asks to avoid. Reuses the SAME `--status-positive-*` CSS
        // vars Badge's `positive` variant already reads (generateCssVariables.ts),
        // so it stays customer/theme-configurable with zero new tokens.
        outlinePositive:
          "border border-[var(--status-positive-border)] bg-transparent text-[var(--status-positive-text)] hover:bg-[var(--status-positive-fill)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        // VoiceForce design system (Phase 2B) — formalizes the dense
        // operational button height that was already in de facto use as a
        // bespoke `h-7`/`className` override on ~10+ pages (pagination,
        // row actions, compact toolbars). One named size instead of each
        // page re-typing the same override.
        xs: "h-7 rounded-md px-2 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
