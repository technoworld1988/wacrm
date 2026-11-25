"use client"

// A small (i) that explains a number. Opens on hover on desktop and on
// tap on phones — a plain tooltip never opens on touch screens.

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function InfoTip({
  text,
  label,
  className,
  iconClassName = "size-3.5",
  side = "top",
}: {
  text: React.ReactNode
  label: string
  className?: string
  iconClassName?: string
  side?: "top" | "bottom"
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <Info className={iconClassName} />
      </PopoverTrigger>
      <PopoverContent side={side} className="w-64 text-xs leading-relaxed normal-case tracking-normal">
        {text}
      </PopoverContent>
    </Popover>
  )
}
