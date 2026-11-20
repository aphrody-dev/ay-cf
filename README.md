# ay-cf

Merged into [`aphrody-dev/ay`](https://github.com/aphrody-dev/ay) on 2026-11-19 and archived. Nothing is maintained here.

| Former path | Path in ay |
| :--- | :--- |
| `packages/cf-control-plane` | `packages/cf-control-plane` |
| `ay-cf.toml`, `assets/r2-catalog.toml`, `ay-cf.local.example.toml` | `packages/cf-control-plane/{cf.toml, r2-catalog.toml, cf.local.example.toml}` |
| `workers/ay-cf-gateway`, `workers/ay-tools-release` | `apps/cf-gateway`, `apps/tools-release` |
| `tools/*` | `tools/cf-*.ts` |
| `python/ay_cf_py`, `pyproject.toml`, `uv.lock` | `python/ay_cf_py`, `pyproject.toml`, `uv.lock` |
| `cpp/edge_abi`, `MODULE.bazel`, `.bazelrc` | `cpp/edge_abi`, `MODULE.bazel`, `.bazelrc` |
| `crates/ay-cf-*` | `crates/ay-cf` |
| `skills/ay-cf-finops-infra` | the aphrody agent plugin; the other skills are the official Cloudflare plugin |
| `agents/*`, `net/*`, `python/*`, `runtime/*`, `rust/*`, `sdk/*` (submodules) | `third_party/cloudflare/*`, `third_party/xh`, `third_party/modern-web-guidance-src`, `third_party/ui-ux-pro-max-skill` (`submodules.toml`) |
| `forks.toml` | the `upstream` field of `submodules.toml` |
| docs | `docs/cloud/` |
| `.github/workflows/ci.yml` | `.github/workflows/cloud.yml` |
