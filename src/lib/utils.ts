import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Canonical shadcn/ui class merger.
 *
 * `clsx` composes conditional class values; `twMerge` resolves Tailwind
 * conflicts so a caller-supplied class always wins over a component default
 * (e.g. `cn("px-2", "px-4")` -> `"px-4"`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
