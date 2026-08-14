"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const MIN_LENGTH = 30;
const MAX_LENGTH = 3500;

export function PromptStage({
  onSubmit,
  disabled,
  disabledReason,
  defaultPrompt,
}: {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  defaultPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt ?? "");
  const length = prompt.trim().length;
  const valid = length >= MIN_LENGTH && length <= MAX_LENGTH;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 py-10"
    >
      <div className="text-center">
        <h1 className="font-serif text-5xl italic leading-[1.05] tracking-tight text-text-primary sm:text-6xl">
          Describe it. Forge it.
          <br />
          Deploy it under consensus.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-text-secondary">
          Every forge is a real multi-validator consensus decision — five GenLayer validators each
          re-run the same objective check against the leader&apos;s proposal before it&apos;s stored
          permanently on-chain, not in a database.
        </p>
      </div>

      <div className="glass-panel w-full">
        <div className="px-5 pt-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <Sparkles size={12} className="text-amber-500" />
            Describe what you want to build
          </span>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="E.g., A contract that stores community proposals and lets an LLM validator judge whether each one satisfies a stated funding criteria…"
          rows={5}
          maxLength={MAX_LENGTH}
        />
        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <span className="text-xs text-text-muted">
            {length} / {MAX_LENGTH} — minimum {MIN_LENGTH}
          </span>
          <Button size="lg" variant="primary" disabled={!valid || disabled} onClick={() => onSubmit(prompt.trim())}>
            Forge under Consensus
          </Button>
        </div>
      </div>

      {disabled && disabledReason && <p className="text-xs text-text-muted">{disabledReason}</p>}
    </motion.div>
  );
}
