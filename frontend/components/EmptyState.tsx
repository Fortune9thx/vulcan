"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl px-8 py-14 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10">
        <Icon className="text-amber-400" size={24} />
      </div>
      <h3 className="font-serif text-xl text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary">{description}</p>
      {actionLabel && (href || onAction) && (
        <Button asChild={!!href} onClick={onAction} className="mt-2">
          {href ? <a href={href}>{actionLabel}</a> : actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
