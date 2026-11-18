#!/usr/bin/env bun
// Syncs distilled official Cloudflare skills into ay-cf/skills and generates /.well-known/agent-skills/index.json (RFC).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const pluginSkills = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".gemini/plugins/cloudflare/skills");
const localSkills = join(root, "skills");
const wellKnownDir = join(root, ".well-known/agent-skills");

export interface SkillEntry {
  name: string;
  description: string;
  url: string;
  sha256: string;
  bytes: number;
}

function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+):\s*(.+)$/.exec(line.trim());
    if (kv) out[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

export function buildSkillsIndex(skillsDir: string, baseUrl = "/skills"): { $schema: string; generated_at: string; skills: SkillEntry[] } {
  const entries: SkillEntry[] = [];
  if (!existsSync(skillsDir)) return { $schema: "https://cloudflare.github.io/agent-skills-discovery-rfc/schema.json", generated_at: new Date().toISOString(), skills: entries };
  for (const d of readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory()) continue;
    const mdPath = join(skillsDir, d.name, "SKILL.md");
    if (!existsSync(mdPath)) continue;
    const raw = readFileSync(mdPath, "utf8");
    const fm = parseFrontmatter(raw);
    const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
    entries.push({
      name: fm.name ?? d.name,
      description: fm.description ?? `Cloudflare ${d.name} skill`,
      url: `${baseUrl}/${d.name}/SKILL.md`,
      sha256,
      bytes: Buffer.byteLength(raw, "utf8"),
    });
  }
  return {
    $schema: "https://cloudflare.github.io/agent-skills-discovery-rfc/schema.json",
    generated_at: new Date().toISOString(),
    skills: entries,
  };
}

if (import.meta.main) {
  const fromPlugin = Bun.argv.includes("--from-plugin") || !existsSync(localSkills);
  if (fromPlugin && existsSync(pluginSkills)) {
    rmSync(localSkills, { recursive: true, force: true });
    cpSync(pluginSkills, localSkills, { recursive: true });
    console.log(`Synced skills into ${localSkills}`);
  }
  const index = buildSkillsIndex(localSkills);
  mkdirSync(wellKnownDir, { recursive: true });
  writeFileSync(join(wellKnownDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`Generated .well-known/agent-skills/index.json (${index.skills.length} skills)`);
}
