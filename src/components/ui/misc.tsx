"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Check } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn("grid size-4 shrink-0 place-items-center rounded border border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[state=delayed-open]:animate-fade-in">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Avatar({ name, src, className, color }: { name: string; src?: string | null; className?: string; color?: string }) {
  return (
    <AvatarPrimitive.Root className={cn("relative inline-flex size-8 shrink-0 overflow-hidden rounded-full", className)}>
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className="grid size-full place-items-center text-[11px] font-semibold text-white"
        style={{ background: color ?? "linear-gradient(135deg, hsl(244 76% 60%), hsl(275 70% 58%))" }}
      >
        {initials(name) || "?"}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Progress({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "warning" | "danger" | "success" }) {
  const pct = Math.max(0, Math.min(100, value));
  const colors = { primary: "bg-primary", warning: "bg-warning", danger: "bg-danger", success: "bg-success" };
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-muted-foreground", className)}>{children}</kbd>;
}
