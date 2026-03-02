"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeroPillProps {
  label: string;
  announcement?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Animated announcement pill banner.
 * Used on the student dashboard to show admin broadcasts/announcements.
 */
export function HeroPill({
  label,
  announcement = "📣 Announcement",
  className,
  onClick,
}: HeroPillProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center space-x-2 rounded-xl",
        "bg-primary/10 ring-1 ring-primary/20",
        "px-3 py-2.5 text-left",
        "hover:bg-primary/15 active:scale-[0.99] transition-all",
        className
      )}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div
        className={cn(
          "shrink-0 rounded-full bg-primary/20 px-2 py-0.5",
          "text-[10px] font-semibold text-primary",
          "text-center"
        )}
      >
        {announcement}
      </div>
      <p className="text-xs font-medium text-foreground truncate flex-1">
        {label}
      </p>
      <svg
        width="12"
        height="12"
        className="ml-1 shrink-0 text-muted-foreground"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8.78141 5.33312L5.20541 1.75712L6.14808 0.814453L11.3334 5.99979L6.14808 11.1851L5.20541 10.2425L8.78141 6.66645H0.666748V5.33312H8.78141Z"
          fill="currentColor"
        />
      </svg>
    </motion.button>
  );
}
