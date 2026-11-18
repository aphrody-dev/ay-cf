#!/usr/bin/env bun
// Offline CI/dev audit: validates ay-cf.toml, assets/r2-catalog.toml, wrangler.jsonc, and /.well-known/agent-skills/index.json SHA-256 digests.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  auditWranglerManifest,
  AyCfManifestSchema,
  loadR2Catalog,
} from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const errors: string[] = [];

try {
  AyCfManifestSchema.parse(Bun.TOML.parse(readFileSync(join(root, "ay-cf.toml"), "utf8")));
} catch (err) {
  errors.push(`ay-cf.toml invalid: ${(err as Error).message}`);
}

try {
  loadR2Catalog(readFileSync(join(root, "assets/r2-catalog.toml"), "utf8"));
} catch (err) {
  errors.push(`assets/r2-catalog.toml invalid: ${(err as Error).message}`);
}

const gwPath = join(root, "workers/ay-cf-gateway/wrangler.jsonc");
if (!existsSync(gwPath)) {
  errors.push("Missing workers/ay-cf-gateway/wrangler.jsonc");
} else {
  const wranglerIssues = auditWranglerManifest(readFileSync(gwPath, "utf8"), ".jsonc");
  errors.push(...wranglerIssues);
}

const idxPath = join(root, ".well-known/agent-skills/index.json");
if (!existsSync(idxPath)) {
  errors.push("Missing .well-known/agent-skills/index.json");
} else {
  const idx = JSON.parse(readFileSync(idxPath, "utf8")) as {
    skills: Array<{ name: string; url: string; sha256: string }>;
  };
  for (const s of idx.skills) {
    const file = join(root, s.url.replace(/^\//, ""));
    if (!existsSync(file)) {
      errors.push(`Skill index points to missing file: ${s.url}`);
      continue;
    }
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (sha !== s.sha256) {
      errors.push(`SHA-256 mismatch on ${s.url}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`AUDIT FAIL: ${e}`);
  process.exit(1);
}
console.log("Audit passed: ay-cf.toml, assets/r2-catalog.toml, workers/ay-cf-gateway/wrangler.jsonc, and agent-skills index verified.");
