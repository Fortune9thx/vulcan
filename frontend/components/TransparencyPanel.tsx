"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { CONFIDENCE_THRESHOLD } from "@/lib/vulcan-abi";

const STRUCTURAL_RULES = [
  "Source parses as valid Python (a real ast.parse, not a text scan)",
  'First line is exactly the pinned runner header (# { "Depends": "py-genlayer:..." })',
  "Contains a real `from genlayer import *` statement",
  "Defines a real class inheriting from gl.Contract",
  "That class has at least one method with a real @gl.public.* decorator",
  "No class-level list[] / dict[] storage annotations",
  "No TreeMap value type other than str (only TreeMap[str, str] survives on Bradbury)",
  `Reported confidence parses as a finite number ≥ ${CONFIDENCE_THRESHOLD}`,
];

const ALIGNMENT_RULES = [
  "A second, independent consensus round (gl.eq_principle.prompt_non_comparative) " +
    "judges whether the source reasonably attempts the request",
  'Classified as "yes", "partial", or "no" with a short stated reason',
  "Neither round is a security audit: they check legality and topical fit, not " +
    "whether the logic is safe, bug-free, or free of anything deliberately malicious " +
    "-- read the source yourself before deploying, especially any code that moves " +
    "value or names an address",
  "A generation's \"Deployed\" address is self-reported by whoever called " +
    "mark_deployed and isn't independently verified against the source on-chain",
];

export function TransparencyPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={15} className="text-amber-400" />
          <p className="text-sm font-medium text-text-primary">What the validators checked</p>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={15} className="text-text-muted" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  Structural gate — every validator re-runs this deterministic check
                </p>
                <ul className="flex flex-col gap-1.5">
                  {STRUCTURAL_RULES.map((rule) => (
                    <li key={rule} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  Alignment judgment — an independent second consensus round
                </p>
                <ul className="flex flex-col gap-1.5">
                  {ALIGNMENT_RULES.map((rule) => (
                    <li key={rule} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
