#!/usr/bin/env node
/**
 * Deploys contracts/Vulcan.py to a GenLayer network and writes the
 * resulting address into contracts/addresses.json.
 *
 * Usage:
 *   VULCAN_DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs [network]
 *
 * network defaults to "bradbury" (testnetBradbury). Pass "studio" for
 * studionet, or "asimov" for testnetAsimov.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTRACT_PATH = join(ROOT, "contracts", "Vulcan.py");
const ADDRESSES_PATH = join(ROOT, "contracts", "addresses.json");

const NETWORKS = {
  bradbury: { chain: testnetBradbury, addressKey: "bradbury" },
  studio: { chain: studionet, addressKey: "studio" },
  asimov: { chain: testnetAsimov, addressKey: "asimov" },
};

// Deliberately excludes ACCEPTED, unlike an earlier version of this script --
// ACCEPTED can still be appealed and reversed before FINALIZED, and this
// script writes the resulting address straight into contracts/addresses.json
// (which the frontend then treats as the live contract). Recording an
// address that gets reversed on appeal would silently point the whole app
// at a dead contract. This is a one-shot CLI deploy, not a live polling UX
// with a latency budget to protect, so there's no real cost to waiting for
// the fully-settled outcome. LEADER_TIMEOUT/VALIDATORS_TIMEOUT are real,
// already-decided terminal outcomes too (per genlayer-js's own
// DECIDED_STATES) -- included so a real timeout fails fast with a clear
// status instead of grinding through the full poll budget first.
const TERMINAL_STATUSES = new Set([
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.LEADER_TIMEOUT,
  TransactionStatus.VALIDATORS_TIMEOUT,
]);

async function pollUntilTerminal(client, hash, { intervalMs = 2000, maxAttempts = 90 } = {}) {
  let lastStatus = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const transaction = await client.getTransaction({ hash });
    const status = transaction.statusName ?? TransactionStatus.PENDING;
    if (status !== lastStatus) {
      console.log(`  status: ${status}`);
      lastStatus = status;
    }
    if (TERMINAL_STATUSES.has(status)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for deployment to reach a terminal status");
}

async function main() {
  const networkArg = process.argv[2] ?? "bradbury";
  const network = NETWORKS[networkArg];
  if (!network) {
    throw new Error(`Unknown network "${networkArg}". Valid: ${Object.keys(NETWORKS).join(", ")}`);
  }

  const privateKey = process.env.VULCAN_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set VULCAN_DEPLOYER_PRIVATE_KEY to a 0x-prefixed private key before deploying.");
  }

  const account = createAccount(privateKey);
  const client = createClient({ chain: network.chain, account });

  const source = await readFile(CONTRACT_PATH, "utf-8");

  console.log(`Deploying contracts/Vulcan.py to ${network.chain.name} as ${account.address}...`);
  const hash = await client.deployContract({ code: source });
  console.log(`Deploy tx: ${hash}`);

  const transaction = await pollUntilTerminal(client, hash);

  if (transaction.statusName !== TransactionStatus.FINALIZED) {
    throw new Error(`Deployment did not finalize (status: ${transaction.statusName}).`);
  }

  const deployedAddress = transaction.to_address ?? transaction.recipient;
  if (!deployedAddress) {
    throw new Error("Deployment succeeded but no contract address was returned in the receipt.");
  }

  const addresses = JSON.parse(await readFile(ADDRESSES_PATH, "utf-8"));
  addresses[network.addressKey] = { ...(addresses[network.addressKey] ?? {}), vulcan: deployedAddress };
  await writeFile(ADDRESSES_PATH, JSON.stringify(addresses, null, 2) + "\n");

  console.log(`\nDeployed Vulcan at ${deployedAddress}`);
  console.log(`Written to contracts/addresses.json under "${network.addressKey}".`);
  const explorer = network.chain.blockExplorers?.default?.url;
  if (explorer) console.log(`Explorer: ${explorer}address/${deployedAddress}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
