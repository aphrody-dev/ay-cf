#!/usr/bin/env bun
// Audits Worker secret binding presence (NAMES ONLY, never reads or logs secret values).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AyCfManifestSchema, captureLiveSnapshot, createCloudflareClient } from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(readFileSync(join(root, "ay-cf.toml"), "utf8")));
const localCfg = Bun.TOML.parse(readFileSync(join(root, "ay-cf.local.toml"), "utf8")) as {
  cloudflare?: { account_id?: string };
};
const accountId = localCfg.cloudflare?.account_id ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) throw new Error("Run `bun tools/bootstrap-local.ts` first");

const snap = await captureLiveSnapshot(createCloudflareClient(), accountId);
let missingTotal = 0;
for (const [name, contract] of Object.entries(manifest.workers)) {
  const live = snap.workers.find((w) => w.id === name);
  if (!live) {
    console.error(`MISSING WORKER: ${name}`);
    missingTotal++;
    continue;
  }
  const present = new Set(live.secrets);
  const missing = contract.secrets.filter((s) => !present.has(s));
  if (missing.length) {
    missingTotal += missing.length;
    console.error(`${name}: missing secret bindings -> ${missing.join(", ")}`);
  } else {
    console.log(`${name}: ${present.size} secret(s) verified`);
  }
}
process.exit(missingTotal ? 1 : 0);
