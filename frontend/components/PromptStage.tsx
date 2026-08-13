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
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8"
    >
      <div className="text-center">
        <h1 className="font-serif text-5xl italic amber-gradient-text sm:text-6xl">VULCAN</h1>
        <p className="mt-3 font-mono text-sm text-text-secondary">
          Describe it. Forge it. Deploy it under consensus.
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-text-muted">
          Every forge is a real multi-validator consensus decision — five GenLayer validators
          independently check the result, and it&apos;s stored permanently on-chain, not in a database.
        </p>
      </div>

      <div className="glass-panel w-full rounded-2xl">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the Intelligent Contract you want VULCAN to forge — e.g. “A contract that stores community proposals and lets an LLM validator judge whether each one satisfies a stated funding criteria.”"
          rows={6}
          maxLength={MAX_LENGTH}
        />
        <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
          <span className="font-mono text-xs text-text-muted">
            {length} / {MAX_LENGTH} — minimum {MIN_LENGTH}
          </span>
          <Button
            size="lg"
            disabled={!valid || disabled}
            onClick={() => onSubmit(prompt.trim())}
            className="animate-pulse-glow"
          >
            <Sparkles size={16} />
            Forge under Consensus
          </Button>
        </div>
      </div>

      {disabled && disabledReason && (
        <p className="font-mono text-xs text-text-muted">{disabledReason}</p>
      )}
    </motion.div>
  );
}
