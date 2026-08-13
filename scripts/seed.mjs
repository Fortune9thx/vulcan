#!/usr/bin/env node
/**
 * Submits a handful of example prompts to a deployed Vulcan contract so
 * the history page has content to show. Requires contracts/addresses.json
 * to already have an entry for the target network (run deploy.mjs first).
 *
 * Usage:
 *   VULCAN_DEPLOYER_PRIVATE_KEY=0x... node scripts/seed.mjs [network]
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ADDRESSES_PATH = join(ROOT, "contracts", "addresses.json");

const NETWORKS = {
  bradbury: { chain: testnetBradbury, addressKey: "bradbury" },
  studio: { chain: studionet, addressKey: "studio" },
  asimov: { chain: testnetAsimov, addressKey: "asimov" },
};

const SEED_PROMPTS = [
  "Build a contract that stores a single greeting string and exposes a getter and setter for it.",
  "Build a contract that tracks a running vote count between two named options and exposes the current tally.",
  "Build a contract that stores a list of community proposal titles and lets anyone append a new one.",
];

const TERMINAL_STATUSES = new Set([
  TransactionStatus.FINALIZED,
  TransactionStatus.ACCEPTED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
]);

async function waitForTerminal(client, hash, { intervalMs = 2000, maxAttempts = 90 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const transaction = await client.getTransaction({ hash });
    const status = transaction.statusName ?? TransactionStatus.PENDING;
    if (TERMINAL_STATUSES.has(status)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for a seed transaction to reach a terminal status");
}

async function main() {
  const networkArg = process.argv[2] ?? "bradbury";
  const network = NETWORKS[networkArg];
  if (!network) {
    throw new Error(`Unknown network "${networkArg}". Valid: ${Object.keys(NETWORKS).join(", ")}`);
  }

  const privateKey = process.env.VULCAN_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set VULCAN_DEPLOYER_PRIVATE_KEY to a 0x-prefixed private key before seeding.");
  }

  const addresses = JSON.parse(await readFile(ADDRESSES_PATH, "utf-8"));
  const vulcanAddress = addresses[network.addressKey]?.vulcan;
  if (!vulcanAddress) {
    throw new Error(`No deployed Vulcan address for "${network.addressKey}" in contracts/addresses.json.`);
  }

  const account = createAccount(privateKey);
  const client = createClient({ chain: network.chain, account });

  for (const prompt of SEED_PROMPTS) {
    console.log(`\nSubmitting: ${prompt.slice(0, 60)}...`);
    const hash = await client.writeContract({
      address: vulcanAddress,
      functionName: "generate",
      args: [prompt],
      value: 0n,
    });
    console.log(`  tx: ${hash}`);
    const transaction = await waitForTerminal(client, hash);
    console.log(`  status: ${transaction.statusName}`);
  }

  console.log("\nSeeding complete.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
