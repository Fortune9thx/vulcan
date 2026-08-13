"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

export function Toast({
  message,
  actionLabel,
  actionHref,
  onDismiss,
}: {
  message: string;
  actionLabel?: string;
  actionHref?: string;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="glass-panel fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-xl px-4 py-3 shadow-2xl"
    >
      <p className="text-sm text-text-primary">{message}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          onClick={onDismiss}
          className="flex items-center gap-1 whitespace-nowrap font-mono text-xs text-amber-400 hover:underline"
        >
          {actionLabel}
          <ArrowRight size={12} />
        </Link>
      )}
      <button onClick={onDismiss} className="text-text-muted transition-colors hover:text-text-primary">
        <X size={14} />
      </button>
    </motion.div>
  );
}
