"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox as CheckboxPrimitive, CheckboxIndicator } from "@radix-ui/react-checkbox"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive>) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-[4px] border border-primary text-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary",
        className
      )}
      {...props}
    >
      <CheckboxIndicator className={cn("flex items-center justify-center text-current")}>
        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M11.17 4.83a.75.75 0 0 1 1.06 1.06l-4.5 4.75a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 0 1 1.06-1.06l1.94 1.94 4.0-4.25Z"
            fill="currentColor"
          />
        </svg>
      </CheckboxIndicator>
    </CheckboxPrimitive>
  )
}

export { Checkbox }
