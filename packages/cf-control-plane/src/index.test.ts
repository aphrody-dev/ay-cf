import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AyCfManifestSchema,
  auditWranglerManifest,
  buildFinOpsReport,
  generateClusterConfigs,
  loadR2Catalog,
  parseWranglerConfig,
} from "./index.ts";

const root = resolve(import.meta.dir, "../../..");

describe("@ay-cf/control-plane", () => {
  test("validates ay-cf.toml and FinOps savings calculation", () => {
    const raw = Bun.TOML.parse(readFileSync(resolve(root, "ay-cf.toml"), "utf8"));
    const manifest = AyCfManifestSchema.parse(raw);
    expect(Object.keys(manifest.tunnels)).toEqual(["aphrody", "rosegriffon", "shenron"]);
    expect(Object.keys(manifest.buckets).length).toBe(11);

    const report = buildFinOpsReport(manifest, [
      { name: "aphrody-assets", tier: "hot-reusable", bytes: 868_000_000, objects: 743 },
      { name: "aphrody-dist", tier: "dist", bytes: 18_300_000_000, objects: 40_986 },
      { name: "aphrody-backups", tier: "cold-offload", bytes: 5_860_000_000, objects: 104 },
    ]);
    expect(report.optimizedBill.totalUsd).toBeLessThan(report.baselineBill.totalUsd);
    expect(report.monthlySavingsUsd).toBeGreaterThan(5);
  });

  test("validates assets/r2-catalog.toml and rejects non-permissive SPDX overrides", () => {
    const raw = readFileSync(resolve(root, "assets/r2-catalog.toml"), "utf8");
    const catalog = loadR2Catalog(raw);
    expect(catalog.source.length).toBeGreaterThanOrEqual(15);
    expect(catalog.rust_crate.length).toBeGreaterThanOrEqual(18);

    const badToml = raw.replaceAll('spdx = "MIT"', 'spdx = "CC-BY-NC-4.0"');
    expect(() => loadR2Catalog(badToml)).toThrow(/blocked SPDX/i);
  });

  test("parses Wrangler JSONC with trailing commas via patched jsonc-parser", () => {
    const wranglerRaw = readFileSync(resolve(root, "workers/ay-cf-gateway/wrangler.jsonc"), "utf8");
    const parsed = parseWranglerConfig(wranglerRaw, ".jsonc");
    expect(parsed.name).toBe("ay-cf-gateway");
    expect(parsed.limits?.cpu_ms).toBe(50);
    expect(auditWranglerManifest(wranglerRaw, ".jsonc")).toEqual([]);
  });

  test("generates OVH Pingora, Hostinger nftables, Mullvad UID routes, and cloudflared configs without IP leaks", () => {
    const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(readFileSync(resolve(root, "ay-cf.toml"), "utf8")));
    const cfg = generateClusterConfigs(manifest);
    expect(cfg.pingoraYaml).toContain("10.200.77.5:443");
    expect(cfg.nftablesOriginConf).toContain("policy drop");
    expect(cfg.mullvadUidScript).toContain("ip rule add uidrange 2002-2002 lookup 51822 priority 100");
    expect(cfg.cloudflaredHaYaml).toContain("dragonballfr.com");
  });
});
