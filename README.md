# ay-cf

Unified Cloudflare monorepo, upstream fork sync, FinOps, tunnels, Mullvad VPN, proxy VPS, and polyglot edge toolchain.

[![ci](https://github.com/aphrody-labs/ay-cf/actions/workflows/ci.yml/badge.svg)](https://github.com/aphrody-labs/ay-cf/actions/workflows/ci.yml)
[![sync](https://github.com/aphrody-labs/ay-cf/actions/workflows/sync.yml/badge.svg)](https://github.com/aphrody-labs/ay-cf/actions/workflows/sync.yml)
[![license](https://img.shields.io/github/license/aphrody-labs/ay-cf)](LICENSE)

## Why

Managing Cloudflare Workers Paid, R2 Paid, multiple `cloudflared` tunnels, OVH/Hostinger proxy nodes, Mullvad split-tunnel exits, and 70+ upstream Cloudflare repositories across fragmented repos causes configuration drift and avoidable overages. `ay-cf` consolidates every `aphrody-labs` Cloudflare fork as lightweight `160000` gitlinks alongside battle-tested Bun/Hono, Rust, C++23/Bazel/Clang, and Python/`uv` tooling plus a verified zero-egress R2 asset catalog.

## Install

```sh
git clone https://github.com/aphrody-labs/ay-cf.git
cd ay-cf
bun install --frozen-lockfile
uv sync
```

## Usage

```sh
just --list
just finops
just reconcile
just cluster-proxy
just r2-catalog
```

## Documentation

The `ay-cf-*` crates and the docs (architecture, FinOps, tunnels, R2 assets, toolchains) live in [`aphrody-labs/ay`](https://github.com/aphrody-labs/ay) (`crates/ay-cf-*`, `docs/imported/ay-cf`).

## Development

The forks, submodules and sync tools are owned by `aphrody-labs/ay-vercel`: set `AY_VERCEL` to a checkout of it (CI checks it out).

```sh
just check
just cpp-check
bun "$AY_VERCEL/tools/forks.ts" --check
bun "$AY_VERCEL/tools/submodules.ts" --check
```

Selectively initialize any submodule group on demand without cloning the full graph:

```sh
just submodules-init rust/pingora rust/quiche sdk/workers-sdk
```

Contributions follow the [organization guide](https://github.com/aphrody-labs/.github/blob/main/CONTRIBUTING.md). Report vulnerabilities as described in the [security policy](https://github.com/aphrody-labs/.github/blob/main/SECURITY.md).

## License

Apache-2.0, see [LICENSE](LICENSE).
