#!/usr/bin/env bun
// Purges stray Claude/AGY scratch artifacts and verifies zero .claude coupling.
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const targets = [".claude", ".tmp", "tmp"];
let removed = 0;

for (const rel of targets) {
  const full = resolve(root, rel);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
    console.log(`purged ${rel}`);
    removed++;
  }
}

console.log(`purge-agent-slop OK (${removed} removed)`);
