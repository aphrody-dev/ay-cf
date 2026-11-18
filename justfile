set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS := "-C target-cpu=native"

just := just_executable()

# List available ay-cf Cloudflare, FinOps, cluster, VPN, and toolchain recipes
default:
    @{{ just }} --list

# Run full polyglot verification (privacy gate, forks/submodules, Bun/Wrangler, Python/uv/ruff, Rust, C++/Bazel)
check: private-gate forks-check submodules-check bun-check cf-audit py-check rust-check

# Verify forks.toml manifest schema and group structure
forks-check:
    bun tools/forks.ts --check

# Create and harden any missing aphrody-labs Cloudflare forks
forks-ensure:
    bun tools/forks.ts --ensure

# Merge upstream across all aphrody-labs forks and update 160000 gitlinks + ledger
sync:
    bun tools/sync.ts --apply

# Verify .gitmodules and 160000 gitlinks match forks.toml
submodules-check:
    bun tools/submodules.ts --check

# Selectively shallow-checkout submodules by path, group, or fork name (e.g. `just submodules-init rust/pingora`)
submodules-init +paths:
    bun tools/submodules.ts --init {{ paths }}

# Sync official Cloudflare skills into skills/ and regenerate /.well-known/agent-skills/index.json
skills-sync:
    bun tools/skills-sync.ts

# Audit Workers Paid + R2 Paid FinOps and generate cost reduction plan
finops:
    bun tools/finops.ts

# Reconcile declarative ay-cf.toml policy against live Cloudflare API (dry-run by default)
reconcile:
    bun tools/reconcile.ts

# Verify cloudflared tunnel ingress parity against live Cloudflare DNS
tunnels:
    bun tools/tunnels.ts

# Audit required secret bindings on every Cloudflare Worker (never prints secret values)
secrets:
    bun tools/secrets.ts

# Generate OVH proxy VPS (Pingora/Nginx), Hostinger nftables, Mullvad UID routes, and cloudflared configs
cluster-proxy:
    bun tools/cluster-proxy.ts

# Validate reusable R2 media & 3D asset catalog and SPDX licenses
r2-catalog:
    bun tools/r2-catalog.ts

# Typecheck and run all Bun tests
bun-check:
    bun x tsc --noEmit
    bun test packages workers tools

# Audit wrangler configs, agent skills index, and dry-run bundle the reference Worker
cf-audit:
    bun tools/audit.ts --strict
    bun x wrangler deploy --dry-run --outdir target/wrangler-dry --config workers/ay-cf-gateway/wrangler.jsonc

# Run Rust fmt, clippy (-D warnings), and workspace unit tests
rust-check:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings
    cargo test --workspace

# Run Python Ruff lint/format checks and pytest suite via uv
py-check:
    uv run ruff check python
    uv run ruff format --check python
    uv run pytest

# Run C++23 Abseil + GoogleTest suite with Bazel 9 and Clang/LLVM 23
cpp-check:
    bazelisk test //cpp/...

# Ensure zero private IPs, IDs, tokens, or local paths in tracked files
private-gate:
    bun tools/private-gate.ts

# Clean ephemeral build and cache artifacts
clean:
    bun -e "import { rmSync } from 'node:fs'; for (const d of ['target', '.pytest_cache', '.ruff_cache']) rmSync(d, { recursive: true, force: true });"
