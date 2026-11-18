#!/usr/bin/env bun
// Offline CI/dev audit: validates ay-cf.toml, assets/r2-catalog.toml, wrangler.jsonc, and /.well-known/agent-skills/index.json SHA-256 digests.
import { join, resolve } from "node:path";
import {
  auditWranglerManifest,
  AyCfManifestSchema,
  loadR2Catalog,
} from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const errors: string[] = [];

let manifestWorkers: Record<string, { workers_dev: boolean }> = {};
try {
  const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(await Bun.file(join(root, "ay-cf.toml")).text()));
  manifestWorkers = manifest.workers;
} catch (err) {
  errors.push(`ay-cf.toml invalid: ${(err as Error).message}`);
}

try {
  loadR2Catalog(await Bun.file(join(root, "assets/r2-catalog.toml")).text());
} catch (err) {
  errors.push(`assets/r2-catalog.toml invalid: ${(err as Error).message}`);
}

for (const relPath of ["workers/ay-cf-gateway/wrangler.jsonc", "workers/ay-tools-release/wrangler.jsonc"]) {
  const wf = Bun.file(join(root, relPath));
  if (!(await wf.exists())) {
    errors.push(`Missing ${relPath}`);
  } else {
    const raw = await wf.text();
    const parsedName = /"name"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? "";
    const expectedWorkersDev = manifestWorkers[parsedName]?.workers_dev ?? false;
    errors.push(...auditWranglerManifest(raw, ".jsonc", expectedWorkersDev));
  }
}

const idxFile = Bun.file(join(root, ".well-known/agent-skills/index.json"));
if (!(await idxFile.exists())) {
  errors.push("Missing .well-known/agent-skills/index.json");
} else {
  const idx = (await idxFile.json()) as {
    skills: Array<{ name: string; url: string; sha256: string }>;
  };
  for (const s of idx.skills) {
    const file = Bun.file(join(root, s.url.replace(/^\//, "")));
    if (!(await file.exists())) {
      errors.push(`Skill index points to missing file: ${s.url}`);
      continue;
    }
    const sha = new Bun.CryptoHasher("sha256").update(await file.bytes()).digest("hex");
    if (sha !== s.sha256) {
      errors.push(`SHA-256 mismatch on ${s.url}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`AUDIT FAIL: ${e}`);
  process.exit(1);
}
console.log(
  "Audit passed: ay-cf.toml, assets/r2-catalog.toml, wrangler.jsonc (ay-cf-gateway, ay-tools-release), and agent-skills index verified.",
);
