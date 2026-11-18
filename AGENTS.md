# AGENTS.md — `aphrody-dev/ay-cf`

## Scope & Boundaries

- Authoritative unified Cloudflare superproject (`forks.toml` -> `aphrody-labs/*` relative submodules with `160000` gitlinks).
- Cross-license separation: never modify external sibling repositories (`aphrody`, `ay`) from `ay-cf`.
- Privacy gate: never commit literal Account IDs, Zone IDs, Tunnel UUIDs, public IPs, emails, or machine home paths (`bun tools/private-gate.ts` must report `0` leaks). Store local state strictly in git-ignored `ay-cf.local.toml` and `.private/`.

## Cloudflare & Library Discipline

- Prefer battle-tested ecosystem libraries over homegrown wrappers:
  - **TypeScript / Workers**: `cloudflare` official SDK, `hono`, `zod`, `wrangler`, `jsonc-parser` (patched in `patches/`).
  - **Rust**: `blake3` (`pure`), `spdx`, `http`, `http-range-header`, `gltf`, `ktx2`, `etagere`, `thumbhash`, `serde`, `toml`, `#![forbid(unsafe_code)]`, zero `.unwrap()`/`.expect()` outside tests, no `mod.rs`.
  - **C++23 / Bazel 9**: `rules_cc`, `abseil-cpp` (`StatusOr`, `Span`, `ComputeCrc32c`), `googletest`, Clang/LLVM 23.
  - **Python 3.13**: official `cloudflare` SDK, `pydantic` v2, `httpx`, managed via `uv` and checked with `ruff`.
- Always run `wrangler types` after changing Worker bindings in `wrangler.jsonc`.
- Always set `limits.cpu_ms`, cost-bounded `observability.enabled` + `observability.traces.enabled` sampling, and `workers_dev = false` on routed production Workers.

## Verification

```sh
just check
just cpp-check
```
