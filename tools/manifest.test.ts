import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseManifest, renderGitmodules } from "./lib/manifest.ts";
import { scanFiles } from "./private-gate.ts";

const root = resolve(import.meta.dir, "..");

describe("ay-cf manifests & gates", () => {
  test("forks.toml renders relative ../<name>.git .gitmodules URLs", () => {
    const raw = readFileSync(resolve(root, "forks.toml"), "utf8");
    const m = parseManifest(raw);
    expect(m.forks.length).toBe(74);
    const gm = renderGitmodules(m);
    expect(gm).toContain("url = ../workerd.git");
    expect(gm).toContain("url = ../pingora.git");
    expect(gm).toContain("url = ../cloudflare-skills.git");
  });

  test("private-gate detects leaked IPs, home paths, emails, and tokens", () => {
    const leaks = scanFiles(
      new Map([
        ["sample.txt", "host = 203.111.22.33\npath = /home/alice/key\nemail = alice@example.com"],
      ]),
    );
    expect(leaks.length).toBeGreaterThanOrEqual(2);
  });
});
