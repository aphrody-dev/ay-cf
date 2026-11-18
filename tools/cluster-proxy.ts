#!/usr/bin/env bun
// Renders production OVH edge_proxy (Pingora/Nginx), Hostinger origin nftables, Mullvad UID routes, and cloudflared configs into .private/generated/.
import { join, resolve } from "node:path";
import { AyCfManifestSchema, generateClusterConfigs } from "../packages/cf-control-plane/src/index.ts";

const root = resolve(import.meta.dir, "..");
const manifest = AyCfManifestSchema.parse(Bun.TOML.parse(await Bun.file(join(root, "ay-cf.toml")).text()));
const localFile = Bun.file(join(root, "ay-cf.local.toml"));
let tunnelIds: Record<string, string> = {};
if (await localFile.exists()) {
  const local = Bun.TOML.parse(await localFile.text()) as {
    cloudflare?: { tunnels?: Record<string, string> };
  };
  tunnelIds = local.cloudflare?.tunnels ?? {};
}

const outDir = join(root, ".private", "generated");
const cfgs = generateClusterConfigs(manifest, tunnelIds);

await Promise.all([
  Bun.write(join(outDir, "pingora-fr2.yaml"), cfgs.pingoraYaml),
  Bun.write(join(outDir, "nginx-fr2-edge.conf"), cfgs.nginxEdgeProxyConf),
  Bun.write(join(outDir, "nftables-prd.conf"), cfgs.nftablesOriginConf),
  Bun.write(join(outDir, "mullvad-uid-routes.sh"), cfgs.mullvadUidScript),
  Bun.write(join(outDir, "cloudflared-ha.yaml"), cfgs.cloudflaredHaYaml),
]);

console.log(`Generated 5 cluster/proxy/VPN/tunnel configs in ${outDir}`);
