#!/usr/bin/env bun
// Renders production OVH edge_proxy (Pingora/Nginx), Hostinger origin nftables, Mullvad UID routes, and cloudflared configs into .private/generated/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AyCfManifestSchema, generateClusterConfigs } from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(readFileSync(join(root, "ay-cf.toml"), "utf8")));
const localPath = join(root, "ay-cf.local.toml");
let tunnelIds: Record<string, string> = {};
if (existsSync(localPath)) {
  const local = Bun.TOML.parse(readFileSync(localPath, "utf8")) as {
    cloudflare?: { tunnels?: Record<string, string> };
  };
  tunnelIds = local.cloudflare?.tunnels ?? {};
}

const outDir = join(root, ".private", "generated");
mkdirSync(outDir, { recursive: true });
const cfgs = generateClusterConfigs(manifest, tunnelIds);

writeFileSync(join(outDir, "pingora-fr2.yaml"), cfgs.pingoraYaml);
writeFileSync(join(outDir, "nginx-fr2-edge.conf"), cfgs.nginxEdgeProxyConf);
writeFileSync(join(outDir, "nftables-prd.conf"), cfgs.nftablesOriginConf);
writeFileSync(join(outDir, "mullvad-uid-routes.sh"), cfgs.mullvadUidScript);
writeFileSync(join(outDir, "cloudflared-ha.yaml"), cfgs.cloudflaredHaYaml);

console.log(`Generated 5 cluster/proxy/VPN/tunnel configs in ${outDir}`);
