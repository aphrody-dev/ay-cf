import Cloudflare from "cloudflare";
import type { AyCfManifest } from "./schemas.ts";
import type { BucketUsageRow } from "./finops.ts";

export interface ConflictItem {
  kind:
    | "wildcard-over-r2-custom-domain"
    | "dual-route-and-custom-domain"
    | "stale-tunnel-cname"
    | "unproxied-origin-ip"
    | "tunnel-dns-drift";
  zone: string;
  hostname: string;
  detail: string;
}

export interface LiveCloudflareSnapshot {
  capturedAt: string;
  accountId: string;
  zones: Array<{
    id: string;
    name: string;
    dnsRecords: Array<Record<string, unknown>>;
    workerRoutes: Array<Record<string, unknown>>;
    workerDomains: Array<Record<string, unknown>>;
    cacheRuleset: Record<string, unknown> | null;
  }>;
  workers: Array<{
    id: string;
    compatibilityDate?: string;
    subdomain: { enabled: boolean; previews_enabled: boolean };
    settings: Record<string, unknown>;
    secrets: Array<string>;
  }>;
  buckets: Array<{
    name: string;
    metrics: BucketUsageRow;
    lifecycle: Record<string, unknown>;
    cors: Record<string, unknown>;
    customDomains: Array<Record<string, unknown>>;
    managedR2Dev: boolean;
  }>;
  tunnels: Array<{
    id: string;
    name: string;
    status: string;
    connections: number;
    ingress: Array<Record<string, unknown>>;
  }>;
}

export function createCloudflareClient(apiToken = process.env.CLOUDFLARE_API_TOKEN): Cloudflare {
  if (!apiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is required");
  }
  return new Cloudflare({ apiToken });
}

export async function captureLiveSnapshot(
  client: Cloudflare,
  accountId: string,
): Promise<LiveCloudflareSnapshot> {
  const zonesPage = await client.zones.list({ per_page: 50 });
  const zoneResults = zonesPage.result ?? [];

  const zones = await Promise.all(
    zoneResults.map(async (z) => {
      const [dnsPage, routesRes, domainsRes] = await Promise.all([
        client.dns.records.list({ zone_id: z.id, per_page: 100 }),
        client.workers.routes.list({ zone_id: z.id }),
        client.workers.domains.list({ account_id: accountId, zone_id: z.id }),
      ]);
      let cacheRuleset: Record<string, unknown> | null = null;
      try {
        cacheRuleset = (await client.rulesets.phases.get("http_request_cache_settings", {
          zone_id: z.id,
        })) as unknown as Record<string, unknown>;
      } catch {
        cacheRuleset = null;
      }
      return {
        id: z.id,
        name: z.name,
        dnsRecords: (dnsPage.result ?? []) as unknown as Array<Record<string, unknown>>,
        workerRoutes: (routesRes.result ?? []) as unknown as Array<Record<string, unknown>>,
        workerDomains: (domainsRes.result ?? []) as unknown as Array<Record<string, unknown>>,
        cacheRuleset,
      };
    }),
  );

  const workersPage = await client.workers.scripts.list({ account_id: accountId });
  const workerScripts = workersPage.result ?? [];
  const workers = await Promise.all(
    workerScripts.map(async (w) => {
      const scriptId = String(w.id);
      const [settings, subdomain, secrets] = await Promise.all([
        client.workers.scripts.settings.get(scriptId, { account_id: accountId }),
        client.workers.scripts.subdomain.get(scriptId, { account_id: accountId }).catch(() => ({
          enabled: false,
          previews_enabled: false,
        })),
        client.workers.scripts.secrets.list(scriptId, { account_id: accountId }).catch(() => []),
      ]);
      const secretList = Array.isArray(secrets)
        ? secrets
        : ((secrets as { result?: Array<{ name?: string }> }).result ?? []);
      return {
        id: scriptId,
        compatibilityDate: (w as unknown as { compatibility_date?: string }).compatibility_date,
        subdomain: {
          enabled: Boolean((subdomain as { enabled?: boolean }).enabled),
          previews_enabled: Boolean((subdomain as { previews_enabled?: boolean }).previews_enabled),
        },
        settings: settings as unknown as Record<string, unknown>,
        secrets: secretList.map((s) => String((s as { name?: string }).name ?? "")).filter(Boolean),
      };
    }),
  );

  const bucketsResp = await client.r2.buckets.list({ account_id: accountId });
  const bucketItems = bucketsResp.buckets ?? [];
  const buckets = await Promise.all(
    bucketItems.map(async (b) => {
      const name = String(b.name);
      const [lifecycle, cors, custom, managed, usageRaw] = await Promise.all([
        client.r2.buckets.lifecycle.get(name, { account_id: accountId }).catch(() => ({ rules: [] })),
        client.r2.buckets.cors.get(name, { account_id: accountId }).catch(() => ({ rules: [] })),
        client.r2.buckets.domains.custom.list(name, { account_id: accountId }).catch(() => ({ domains: [] })),
        client.r2.buckets.domains.managed.list(name, { account_id: accountId }).catch(() => ({ enabled: false })),
        fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${name}/usage`, {
          headers: { Authorization: `Bearer ${client.apiToken}` },
        })
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      const usageResult = (usageRaw as { result?: Record<string, unknown> }).result ?? {};
      const payloadBytes = Number(usageResult.payloadSize ?? 0) + Number(usageResult.metadataSize ?? 0);
      const objectCount = Number(usageResult.objectCount ?? 0);
      return {
        name,
        metrics: {
          name,
          tier: "dist" as const,
          bytes: Number.isFinite(payloadBytes) ? payloadBytes : 0,
          objects: Number.isFinite(objectCount) ? objectCount : 0,
        },
        lifecycle: lifecycle as unknown as Record<string, unknown>,
        cors: cors as unknown as Record<string, unknown>,
        customDomains: ((custom as { domains?: Array<Record<string, unknown>> }).domains ?? []),
        managedR2Dev: Boolean((managed as { enabled?: boolean }).enabled),
      };
    }),
  );

  const tunnelsPage = await client.zeroTrust.tunnels.cloudflared.list({
    account_id: accountId,
    is_deleted: false,
  });
  const tunnels = await Promise.all(
    (tunnelsPage.result ?? []).map(async (t) => {
      const id = String(t.id);
      const cfg = await client.zeroTrust.tunnels.cloudflared.configurations
        .get(id, { account_id: accountId })
        .catch(() => null);
      const ingress =
        ((cfg as { config?: { ingress?: Array<Record<string, unknown>> } } | null)?.config?.ingress ?? []);
      return {
        id,
        name: String(t.name ?? id),
        status: String(t.status ?? "unknown"),
        connections: Array.isArray(t.connections) ? t.connections.length : 0,
        ingress,
      };
    }),
  );

  return {
    capturedAt: new Date().toISOString(),
    accountId,
    zones,
    workers,
    buckets,
    tunnels,
  };
}

export function detectStructuralConflicts(snapshot: LiveCloudflareSnapshot): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  const liveTunnelIds = new Set(snapshot.tunnels.map((t) => t.id));
  const r2DomainsByHost = new Map<string, string>();
  for (const b of snapshot.buckets) {
    for (const d of b.customDomains) {
      const host = String(d.domain ?? "").toLowerCase();
      if (host && d.enabled) r2DomainsByHost.set(host, b.name);
    }
  }

  for (const z of snapshot.zones) {
    const routePatterns = z.workerRoutes.map((r) => ({
      pattern: String(r.pattern ?? ""),
      script: String(r.script ?? ""),
    }));
    const wildcardRoute = routePatterns.find((r) => r.pattern === `*.${z.name}/*`);

    for (const [host, bucket] of r2DomainsByHost) {
      if (host.endsWith(`.${z.name}`) && wildcardRoute) {
        conflicts.push({
          kind: "wildcard-over-r2-custom-domain",
          zone: z.name,
          hostname: host,
          detail: `Wildcard route "${wildcardRoute.pattern}" (${wildcardRoute.script}) intercepts R2 Custom Domain for bucket "${bucket}"`,
        });
      }
    }

    for (const wd of z.workerDomains) {
      const host = String(wd.hostname ?? "").toLowerCase();
      const service = String(wd.service ?? "");
      const matchingRoute = routePatterns.find((r) => r.pattern.toLowerCase().startsWith(`${host}/`));
      if (matchingRoute) {
        conflicts.push({
          kind: "dual-route-and-custom-domain",
          zone: z.name,
          hostname: host,
          detail: `Hostname has BOTH Worker Custom Domain (${service}) and Worker Route (${matchingRoute.pattern} -> ${matchingRoute.script})`,
        });
      }
    }

    for (const rec of z.dnsRecords) {
      const type = String(rec.type ?? "");
      const name = String(rec.name ?? "");
      const content = String(rec.content ?? "");
      const proxied = Boolean(rec.proxied);

      if (type === "CNAME" && content.endsWith(".cfargotunnel.com")) {
        const uuid = content.replace(/\.cfargotunnel\.com$/i, "");
        if (!liveTunnelIds.has(uuid)) {
          conflicts.push({
            kind: "stale-tunnel-cname",
            zone: z.name,
            hostname: name,
            detail: `CNAME points to missing/deleted tunnel ${uuid}`,
          });
        }
      }
      if (type === "A" && !proxied && !/^vps\./i.test(name)) {
        conflicts.push({
          kind: "unproxied-origin-ip",
          zone: z.name,
          hostname: name,
          detail: `Unproxied DNS A record exposes origin IP directly instead of Cloudflare proxy/tunnel`,
        });
      }
    }
  }
  return conflicts;
}

export interface SafeApplySummary {
  subdomainUpdates: Array<{ worker: string; enabled: boolean; previews_enabled: boolean }>;
  observabilityUpdates: Array<{ worker: string; logSampling: number; traceSampling: number; ok: boolean; error?: string }>;
  limitsUpdates: Array<{ worker: string; cpuMs: number; bindingsPreserved: boolean; ok: boolean; error?: string }>;
  r2LifecycleUpdates: Array<{ bucket: string; maxAgeSeconds: number; ok: boolean }>;
  r2CorsUpdates: Array<{ bucket: string; ok: boolean }>;
  cacheRulesetUpdates: Array<{ zone: string; ok: boolean; rulesCount: number }>;
}

export async function applySafeOptimizations(
  client: Cloudflare,
  manifest: AyCfManifest,
  snapshot: LiveCloudflareSnapshot,
  opts: { apply: boolean },
): Promise<SafeApplySummary> {
  const summary: SafeApplySummary = {
    subdomainUpdates: [],
    observabilityUpdates: [],
    limitsUpdates: [],
    r2LifecycleUpdates: [],
    r2CorsUpdates: [],
    cacheRulesetUpdates: [],
  };

  // 1. Disable exposed .workers.dev / preview URLs on routed production Workers
  for (const w of snapshot.workers) {
    const spec = manifest.workers[w.id];
    if (!spec) continue;
    if (w.subdomain.enabled !== spec.workers_dev || w.subdomain.previews_enabled !== spec.previews) {
      summary.subdomainUpdates.push({
        worker: w.id,
        enabled: spec.workers_dev,
        previews_enabled: spec.previews,
      });
      if (opts.apply) {
        await client.workers.scripts.subdomain.create(w.id, {
          account_id: snapshot.accountId,
          enabled: spec.workers_dev,
          previews_enabled: spec.previews,
        });
      }
    }
  }

  // 2. Apply Observability right-sizing + CPU limits (canary `docs-proxy` & `aphrody-releases` first!)
  const orderedWorkers = [...snapshot.workers].sort((a, b) => {
    const rank = (id: string) => (id === "docs-proxy" ? 0 : id === "aphrody-releases" ? 1 : 2);
    return rank(a.id) - rank(b.id);
  });

  for (const w of orderedWorkers) {
    const spec = manifest.workers[w.id];
    if (!spec) continue;

    const currentObs = (w.settings.observability ?? {}) as {
      enabled?: boolean;
      logs?: { head_sampling_rate?: number };
      traces?: { enabled?: boolean; head_sampling_rate?: number };
    };
    const needsObs =
      currentObs.enabled !== true ||
      currentObs.logs?.head_sampling_rate !== spec.log_sampling ||
      currentObs.traces?.enabled !== true ||
      currentObs.traces?.head_sampling_rate !== spec.trace_sampling;

    if (needsObs) {
      if (!opts.apply) {
        summary.observabilityUpdates.push({
          worker: w.id,
          logSampling: spec.log_sampling,
          traceSampling: spec.trace_sampling,
          ok: true,
        });
      } else {
        try {
          await client.workers.scripts.settings.edit(w.id, {
            account_id: snapshot.accountId,
            observability: {
              enabled: true,
              head_sampling_rate: spec.log_sampling,
              redact_query_string: false,
              logs: {
                enabled: true,
                invocation_logs: true,
                persist: true,
                head_sampling_rate: spec.log_sampling,
              },
              traces: {
                enabled: true,
                persist: true,
                head_sampling_rate: spec.trace_sampling,
              },
            },
          });
          summary.observabilityUpdates.push({
            worker: w.id,
            logSampling: spec.log_sampling,
            traceSampling: spec.trace_sampling,
            ok: true,
          });
        } catch (err) {
          summary.observabilityUpdates.push({
            worker: w.id,
            logSampling: spec.log_sampling,
            traceSampling: spec.trace_sampling,
            ok: false,
            error: (err as Error).message,
          });
        }
      }
    }

    const currentLimits = (w.settings.limits ?? {}) as { cpu_ms?: number };
    if (currentLimits.cpu_ms !== spec.cpu_ms) {
      if (!opts.apply) {
        summary.limitsUpdates.push({
          worker: w.id,
          cpuMs: spec.cpu_ms,
          bindingsPreserved: true,
          ok: true,
        });
      } else {
        try {
          const before = await client.workers.scripts.scriptAndVersionSettings.get(w.id, {
            account_id: snapshot.accountId,
          });
          const beforeBindings = before.bindings ?? [];
          const settingsPart = new File(
            [
              JSON.stringify({
                limits: { cpu_ms: spec.cpu_ms },
                bindings: beforeBindings,
              }),
            ],
            "settings",
            { type: "application/json" },
          );
          await client.workers.scripts.scriptAndVersionSettings.edit(w.id, {
            account_id: snapshot.accountId,
            settings: settingsPart as never,
          });
          const after = await client.workers.scripts.scriptAndVersionSettings.get(w.id, {
            account_id: snapshot.accountId,
          });
          const preserved = (after.bindings?.length ?? 0) === beforeBindings.length;
          summary.limitsUpdates.push({
            worker: w.id,
            cpuMs: spec.cpu_ms,
            bindingsPreserved: preserved,
            ok: preserved,
            ...(preserved ? {} : { error: "bindings count changed after canary edit" }),
          });
          if (!preserved) {
            throw new Error(`Aborting limits update on ${w.id}: bindings mismatch`);
          }
        } catch (err) {
          summary.limitsUpdates.push({
            worker: w.id,
            cpuMs: spec.cpu_ms,
            bindingsPreserved: false,
            ok: false,
            error: (err as Error).message,
          });
          if (w.id === "aphrody-releases" || w.id === "docs-proxy") {
            throw err;
          }
        }
      }
    }
  }

  // 3. Tighten R2 multipart abort lifecycle (604800s -> 86400s) + ensure Range CORS on hot-reusable buckets
  for (const b of snapshot.buckets) {
    const spec = manifest.buckets[b.name];
    if (!spec) continue;
    const rules = ((b.lifecycle as { rules?: Array<Record<string, unknown>> }).rules ?? []).map((r) => ({ ...r }));
    const mpRule = rules.find((r) => Boolean(r.abortMultipartUploadsTransition));
    const currentAge = (
      (mpRule?.abortMultipartUploadsTransition as { condition?: { maxAge?: number } } | undefined)?.condition
        ?.maxAge
    );
    if (currentAge !== spec.abort_multipart_seconds) {
      if (mpRule) {
        mpRule.conditions = {
          prefix: ((mpRule.conditions as { prefix?: string } | undefined)?.prefix ?? ""),
        };
        mpRule.abortMultipartUploadsTransition = {
          condition: { type: "Age", maxAge: spec.abort_multipart_seconds },
        };
      } else {
        rules.push({
          id: "Default Multipart Abort Rule",
          enabled: true,
          conditions: { prefix: "" },
          abortMultipartUploadsTransition: {
            condition: { type: "Age", maxAge: spec.abort_multipart_seconds },
          },
        });
      }
      if (opts.apply) {
        await client.r2.buckets.lifecycle.update(b.name, {
          account_id: snapshot.accountId,
          rules: rules as never,
        });
      }
      summary.r2LifecycleUpdates.push({ bucket: b.name, maxAgeSeconds: spec.abort_multipart_seconds, ok: true });
    }

    if (spec.tier === "hot-reusable") {
      const existingCors = ((b.cors as { rules?: Array<unknown> }).rules ?? []);
      if (existingCors.length === 0) {
        if (opts.apply) {
          await client.r2.buckets.cors.update(b.name, {
            account_id: snapshot.accountId,
            rules: [
              {
                id: "ay-cf-reusable-assets-range",
                allowed: {
                  origins: ["https://aphrody.app", "https://*.aphrody.app", "https://aphrody.com", "http://localhost:*"],
                  methods: ["GET", "HEAD"],
                  headers: ["Range", "If-Range", "Origin", "Accept"],
                },
                exposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
                maxAgeSeconds: 86400,
              },
            ],
          });
        }
        summary.r2CorsUpdates.push({ bucket: b.name, ok: true });
      }
    }
  }

  // 4. Optimize Zone Cache Rulesets cleanly without altering existing origin/site rules
  for (const z of snapshot.zones) {
    const existing = ((z.cacheRuleset as { rules?: Array<Record<string, unknown>> } | null)?.rules ?? []).map(
      (r) => ({ ...r }),
    );
    if (!existing.length) continue;
    let updatedRules: Array<Record<string, unknown>> | null = null;

    if (z.name === "aphrody.com") {
      // Remove duplicate `Imported page rule cdn.aphrody.com/*` and expand primary CDN rule to include releases/downloads/video
      const deduped = existing.filter((r) => r.ref !== "aphrody-pagerule-cdn");
      const target = deduped.find((r) => r.ref === "aphrody-origin-cdn");
      const wantedExpr = '(http.host in {"cdn.aphrody.com" "releases.aphrody.com" "downloads.aphrody.com" "video.aphrody.com"})';
      if (target && (target.expression !== wantedExpr || deduped.length !== existing.length)) {
        target.expression = wantedExpr;
        target.description = "Aphrody CDN, release & media hosts: edge cache following Cache-Control";
        updatedRules = deduped;
      }
    } else if (z.name === "aphrody.app") {
      const target = existing.find((r) => String(r.expression).includes("assets.aphrody.app"));
      const wantedExpr = '(http.host in {"assets.aphrody.app" "video.aphrody.app" "bun-lib.aphrody.app"})';
      if (target && target.expression !== wantedExpr) {
        target.expression = wantedExpr;
        updatedRules = existing;
      }
    } else if (z.name === "rosegriffon.fr") {
      const target = existing.find((r) => String(r.expression).includes("cdn.rosegriffon.fr"));
      const wantedExpr = '(http.host in {"cdn.rosegriffon.fr" "r2.rosegriffon.fr"})';
      if (target && target.expression !== wantedExpr) {
        target.expression = wantedExpr;
        updatedRules = existing;
      }
    }

    if (updatedRules) {
      const cleanRules = updatedRules.map((r) => ({
        action: r.action,
        action_parameters: r.action_parameters,
        description: r.description,
        enabled: r.enabled,
        expression: r.expression,
        ref: r.ref,
      }));
      if (opts.apply) {
        await client.rulesets.phases.update("http_request_cache_settings", {
          zone_id: z.id,
          rules: cleanRules as never,
        });
      }
      summary.cacheRulesetUpdates.push({ zone: z.name, ok: true, rulesCount: cleanRules.length });
    }
  }

  return summary;
}
