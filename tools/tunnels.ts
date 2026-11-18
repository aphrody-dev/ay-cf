#!/usr/bin/env bun
// Audits live cloudflared tunnels and verifies DNS CNAME parity against ay-cf.toml.
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
const cnameTargets = new Set<string>();
for (const z of snap.zones) {
  for (const r of z.dnsRecords) {
    if (r.type === "CNAME" && String(r.content).endsWith(".cfargotunnel.com")) {
      cnameTargets.add(String(r.name).toLowerCase());
    }
  }
}

for (const t of snap.tunnels) {
  const expected = manifest.tunnels[t.name];
  const hosts = t.ingress.map((i) => String(i.hostname ?? "")).filter(Boolean);
  const missingDns = hosts.filter((h) => !cnameTargets.has(h.toLowerCase()));
  console.log(
    `tunnel=${t.name} status=${t.status} conns=${t.connections} ingress=${hosts.length} declared=${expected?.ingress.length ?? "?"} missing_cname=${missingDns.join(",") || "none"}`,
  );
}
