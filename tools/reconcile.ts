#!/usr/bin/env bun
// Reconciles declarative ay-cf.toml against live Cloudflare API (dry-run by default; --backup; --apply-safe).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  applySafeOptimizations,
  AyCfManifestSchema,
  captureLiveSnapshot,
  createCloudflareClient,
  detectStructuralConflicts,
} from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
const backupOnly = argv.includes("--backup");
const applySafe = argv.includes("--apply-safe");

const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(readFileSync(join(root, "ay-cf.toml"), "utf8")));
const localCfg = Bun.TOML.parse(readFileSync(join(root, "ay-cf.local.toml"), "utf8")) as {
  cloudflare?: { account_id?: string };
};
const accountId = localCfg.cloudflare?.account_id ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) throw new Error("Run `bun tools/bootstrap-local.ts` first (missing account_id)");

const client = createCloudflareClient();
const privateDir = join(root, ".private");
mkdirSync(privateDir, { recursive: true });

const snap = await captureLiveSnapshot(client, accountId);
if (backupOnly || applySafe) {
  const backupFile = join(privateDir, `live-backup-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(backupFile, JSON.stringify(snap, null, 2) + "\n", { mode: 0o600 });
  console.log(`Saved live backup -> ${backupFile}`);
}
if (backupOnly) process.exit(0);

const conflicts = detectStructuralConflicts(snap);
const summary = await applySafeOptimizations(client, manifest, snap, { apply: applySafe });

const md = [
  `# ay-cf Reconciliation Report (${applySafe ? "APPLIED SAFE" : "DRY-RUN"})`,
  "",
  `- Workers subdomain (.workers.dev / previews) updates: ${summary.subdomainUpdates.length}`,
  `- Workers observability right-sizing updates: ${summary.observabilityUpdates.length}`,
  `- Workers CPU limits (cpu_ms) updates: ${summary.limitsUpdates.length}`,
  `- R2 multipart-abort 86400s lifecycle updates: ${summary.r2LifecycleUpdates.length}`,
  `- R2 Range/WebGPU CORS updates: ${summary.r2CorsUpdates.length}`,
  `- Zone Cache Ruleset optimizations: ${summary.cacheRulesetUpdates.length}`,
  `- Structural DNS/Route conflicts flagged (manual cutover): ${conflicts.length}`,
  "",
  "## Structural Conflicts Requiring Explicit Cutover",
  "",
  ...conflicts.map((c) => `- **[${c.kind}]** \`${c.zone}\` / \`${c.hostname}\`: ${c.detail}`),
  "",
].join("\n");
writeFileSync(join(privateDir, "reconcile-report.md"), md);
writeFileSync(join(privateDir, "reconcile-summary.json"), JSON.stringify({ applySafe, conflicts, summary }, null, 2) + "\n");

console.log(
  `Reconcile (${applySafe ? "APPLIED" : "DRY-RUN"}): subdomain=${summary.subdomainUpdates.length}, obs=${summary.observabilityUpdates.length}, limits=${summary.limitsUpdates.length}, r2_lc=${summary.r2LifecycleUpdates.length}, cors=${summary.r2CorsUpdates.length}, cache=${summary.cacheRulesetUpdates.length}, conflicts=${conflicts.length}`,
);
