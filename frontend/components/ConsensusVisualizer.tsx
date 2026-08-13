"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerTransaction } from "genlayer-js/types";
import { cn } from "@/lib/utils";

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 118;

function nodePosition(index: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
  return {
    x: CENTER + RADIUS * Math.cos(angle),
    y: CENTER + RADIUS * Math.sin(angle),
  };
}

const NODES = Array.from({ length: 5 }, (_, i) => nodePosition(i));
const LEADER_INDEX = 0;
const VALIDATOR_INDICES = [1, 2, 3, 4];

const STATUS_COPY: Partial<Record<TransactionStatus, string>> = {
  [TransactionStatus.UNINITIALIZED]: "Preparing transaction…",
  [TransactionStatus.PENDING]: "Transaction submitted, awaiting inclusion…",
  [TransactionStatus.PROPOSING]: "Leader proposing a solution…",
  [TransactionStatus.COMMITTING]: "Validators evaluating independently…",
  [TransactionStatus.REVEALING]: "Checking equivalence across validators…",
  [TransactionStatus.ACCEPTED]: "Consensus reached",
  [TransactionStatus.FINALIZED]: "Finalized on-chain",
  [TransactionStatus.UNDETERMINED]: "Consensus not reached",
  [TransactionStatus.CANCELED]: "Transaction canceled",
};

function isAtLeast(status: TransactionStatus, stage: TransactionStatus): boolean {
  const order = [
    TransactionStatus.UNINITIALIZED,
    TransactionStatus.PENDING,
    TransactionStatus.PROPOSING,
    TransactionStatus.COMMITTING,
    TransactionStatus.REVEALING,
    TransactionStatus.ACCEPTED,
    TransactionStatus.FINALIZED,
  ];
  const a = order.indexOf(status);
  const b = order.indexOf(stage);
  if (a === -1 || b === -1) return false;
  return a >= b;
}

export function ConsensusVisualizer({
  status,
  transaction,
}: {
  status: TransactionStatus;
  transaction?: GenLayerTransaction | null;
}) {
  const failed = status === TransactionStatus.UNDETERMINED || status === TransactionStatus.CANCELED;
  const leaderActive = isAtLeast(status, TransactionStatus.PROPOSING) && !failed;
  const validatorsCommitting = isAtLeast(status, TransactionStatus.COMMITTING) && !failed;
  const revealing = isAtLeast(status, TransactionStatus.REVEALING) && !failed;
  const consensusReached = isAtLeast(status, TransactionStatus.ACCEPTED) && !failed;

  const votesCommitted = transaction?.lastRound?.votesCommitted;
  const votesRevealed = transaction?.lastRound?.votesRevealed;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="overflow-visible">
          {/* Connecting lines: leader -> each validator */}
          {VALIDATOR_INDICES.map((vIdx) => {
            const from = NODES[LEADER_INDEX];
            const to = NODES[vIdx];
            return (
              <motion.line
                key={`line-${vIdx}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={failed ? "rgba(239,68,68,0.5)" : "rgba(245,158,11,0.6)"}
                strokeWidth={consensusReached ? 2 : 1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: revealing ? 1 : 0,
                  opacity: revealing ? (consensusReached ? 0.9 : 0.5) : 0,
                }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            );
          })}

          {/* Validator ring, connecting adjacent validators once consensus reached */}
          {consensusReached &&
            VALIDATOR_INDICES.map((vIdx, i) => {
              const next = VALIDATOR_INDICES[(i + 1) % VALIDATOR_INDICES.length];
              const from = NODES[vIdx];
              const to = NODES[next];
              return (
                <motion.line
                  key={`ring-${vIdx}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="rgba(245,158,11,0.35)"
                  strokeWidth={1}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
              );
            })}

          {/* Consensus burst ring */}
          <AnimatePresence>
            {consensusReached && (
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="rgba(245,158,11,0.5)"
                strokeWidth={2}
                initial={{ scale: 0.3, opacity: 0.9 }}
                animate={{ scale: 1.15, opacity: 0 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          {/* Leader node */}
          <ConsensusNode
            x={NODES[LEADER_INDEX].x}
            y={NODES[LEADER_INDEX].y}
            label="Leader"
            active={leaderActive}
            failed={failed}
            large
          />

          {/* Validator nodes */}
          {VALIDATOR_INDICES.map((vIdx, i) => (
            <ConsensusNode
              key={vIdx}
              x={NODES[vIdx].x}
              y={NODES[vIdx].y}
              label={`Validator ${i + 1}`}
              active={validatorsCommitting}
              revealed={revealing}
              failed={failed}
              delay={i * 0.12}
            />
          ))}
        </svg>
      </div>

      <div className="text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "font-mono text-sm tracking-wide",
              failed ? "text-danger" : consensusReached ? "text-amber-400 glow-text" : "text-text-secondary"
            )}
          >
            {STATUS_COPY[status] ?? status}
          </motion.p>
        </AnimatePresence>
        {(votesCommitted !== undefined || votesRevealed !== undefined) && !failed && (
          <p className="mt-1 font-mono text-xs text-text-muted">
            {votesCommitted !== undefined && `${votesCommitted} committed`}
            {votesCommitted !== undefined && votesRevealed !== undefined && " · "}
            {votesRevealed !== undefined && `${votesRevealed} revealed`}
          </p>
        )}
      </div>
    </div>
  );
}

function ConsensusNode({
  x,
  y,
  label,
  active,
  revealed,
  failed,
  large,
  delay = 0,
}: {
  x: number;
  y: number;
  label: string;
  active: boolean;
  revealed?: boolean;
  failed?: boolean;
  large?: boolean;
  delay?: number;
}) {
  const radius = large ? 14 : 10;
  const color = failed ? "#ef4444" : "#F59E0B";

  return (
    <g>
      <motion.circle
        cx={x}
        cy={y}
        r={radius}
        fill={active ? color : "rgba(163,160,154,0.15)"}
        stroke={active ? color : "rgba(163,160,154,0.3)"}
        strokeWidth={1.5}
        animate={
          active && !revealed
            ? { scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }
            : { scale: revealed ? 1.1 : 1, opacity: 1 }
        }
        transition={
          active && !revealed
            ? { duration: 1.4, repeat: Infinity, delay, ease: "easeInOut" }
            : { duration: 0.4, delay }
        }
      />
      <text
        x={x}
        y={y + radius + 16}
        textAnchor="middle"
        className="fill-text-muted font-mono"
        fontSize={9}
      >
        {label}
      </text>
    </g>
  );
}
