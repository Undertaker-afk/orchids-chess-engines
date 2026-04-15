import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("inline-flex rounded-full border border-border bg-[#0e1728] px-2 py-0.5 text-xs", className)} {...props} />
  );
}
