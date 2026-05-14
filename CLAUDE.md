# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For execution flow maps, module responsibility matrix, account type locations, and SDK↔program mappings, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Package Manager

Use `bun` (not yarn/npm) for JavaScript/TypeScript dependency management: `bun install`, `bun run <script>`.

## Build

**M1/Apple Silicon:** Always use an x86_64 cross-compile toolchain — never a native aarch64 toolchain. Native ARM toolchains break memory layout expectations for zero-copy accounts, which must match the on-chain (x86_64) representation.

- Anchor 0.29.x branches: `rustup default 1.76.0-x86_64-apple-darwin`
- Anchor 1.0 branches: `rustup default stable-x86_64-apple-darwin`

**Rust version and zero-copy struct alignment:** Rust ≥ 1.77 corrected `align_of::<u128>()` to 16 bytes on x86_64; the on-chain SBF target has always kept it at 8 bytes. All zero-copy structs in this repo are explicitly padded so `(SIZE - 8) % 16 == 0` and u128/i128 fields are ordered before any `PoolBalance` fields — this makes `sizeof` identical on all targets regardless of Rust version. You must still develop and test with Rust ≥ 1.77 so that x86_64 exercises real 16-byte u128 alignment and any future struct change that breaks the invariant is caught locally (the `const_assert_eq!` guards fire) rather than silently diverging on-chain. The minimum for Anchor 1.0 branches is Rust ≥ 1.89 (Anchor 1.0 MSRV). See [`docs/alignment-and-native-offsets.md`](./docs/alignment-and-native-offsets.md) for the full invariant rules and guidance on adding fields to zero-copy structs.

**Solana programs (Rust/Anchor):**
```bash
anchor build
# With anchor-test feature (required for TS integration tests):
anchor build -- --features anchor-test
```

**SDK:**
```bash
cd sdk/ && bun install && bun run build
```

**Update IDL after program changes:**

NEVER hand-edit `sdk/src/idl/drift.json` or `sdk/src/idl/drift.ts` — they are generated artifacts. To change them, modify the Rust program and regenerate. Manual edits will silently drift from on-chain layout and break clients.

```bash
anchor build -- --features anchor-test && cp target/idl/drift.json sdk/src/idl/drift.json
```

After regenerating the JSON, also regenerate the TypeScript IDL the SDK imports:
```bash
anchor idl type sdk/src/idl/drift.json --out sdk/src/idl/drift.ts
```

**Fast IDL-only regeneration** (no SBF .so build, useful when only field names/layouts changed):
```bash
anchor idl build -p drift -o target/idl/drift.json -- --features anchor-test
cp target/idl/drift.json sdk/src/idl/drift.json
anchor idl type sdk/src/idl/drift.json --out sdk/src/idl/drift.ts
```
`anchor idl build` runs under `cargo test` with the host toolchain, which sidesteps the bundled-cargo issues described below.

### macOS build environment

Two pitfalls that fresh setups regularly hit. If you see either symptom, apply the matching fix before debugging anything else.

**Symptom: `c/blake3_impl.h:4:10: fatal error: 'assert.h' file not found`** during `anchor build`.
The Solana platform-tools clang has no built-in macOS SDK path; it can't find system headers. Fix:
```bash
export SDKROOT="$(xcrun --show-sdk-path)"
```
(or prefix the build command with it). Add it to your shell profile so future sessions inherit it.

**Symptom: `feature 'edition2024' is required ... not stabilized in this version of Cargo (1.84.0)`** when downloading `toml_datetime` / `wincode` / `toml_parser`.
The bundled cargo in older platform-tools (v1.51 ships cargo 1.84) can't parse `edition2024` deps. Fix by upgrading platform-tools — the Anchor 1.0 branches need ≥ v1.54:
```bash
cargo-build-sbf --tools-version v1.54 --force-tools-install
```
Run that once; subsequent `anchor build` invocations will use the new toolchain. Check with `cargo-build-sbf --version`.

**Symptom: program panics with `Access violation in unknown section at address 0x80 of size 8`** (or similar address) at runtime, on instructions that touch types you didn't change.
This is almost always **stale SBF build artifacts** after a Cargo.lock dep change. SBF caches compiled `.rlib`s under `target/sbpf-solana-solana/`, and the cache key doesn't catch every dep-resolution change — the resulting `.so` loads but reads/writes wrong offsets. Whenever Cargo.lock dep versions change (e.g. after `cargo update`, or after switching branches with different lockfiles), do:
```bash
rm -rf target/sbpf-solana-solana target/deploy
cargo-build-sbf --tools-version v1.54 -- --features anchor-test
```

## Testing

**Rust unit tests:**
```bash
cargo test -p drift                    # drift program only
cargo test -p drift -- --show-output  # with stdout
```

**Single TypeScript integration test:**
```bash
ts-mocha -t 300000 ./tests/<test_file>.ts
```

**Full TypeScript integration test suite** (builds first, then runs all ~70 test files serially):
```bash
bash test-scripts/run-anchor-tests.sh
# Skip rebuild if .so is already built:
bash test-scripts/run-anchor-tests.sh --skip-build
```
The integration tests in `tests/` resolve `@coral-xyz/anchor` and friends from the **repo-root** `node_modules`, not from `sdk/`. If you only ran `bun install` / `yarn install` inside `sdk/`, the test files will fail to load with `Cannot find module '@coral-xyz/anchor'`. Run `yarn install` (or `bun install`) at the repo root first.

**SDK unit tests:**
```bash
cd sdk/ && bun run test:dlob    # DLOB tests
cd sdk/ && bun run test:ci      # CI subset
```

**Lint/format:**
```bash
cargo fmt                        # Rust
cd sdk/ && yarn prettify:fix     # SDK (TypeScript)
```

**Always run `cargo fmt` and `cargo clippy -p drift` before declaring Rust work complete.** CI runs `cargo fmt -- --check` and `cargo clippy -p drift` (see `.github/workflows/main.yml`) and will fail the PR otherwise. The equivalent SDK gate is `cd sdk/ && yarn prettify` + `yarn lint`. Do not hand off a change until those commands are clean.

## Git / commit conventions

**Never add Claude (or any AI assistant) as a `Co-Authored-By` on commits, PR bodies, or anywhere else in version control.** Write commit messages and PR descriptions as the human author. No `🤖 Generated with …` footers either.

## Architecture

This is **Drift Protocol v2** — a Solana perpetuals and spot trading protocol.

### Programs (`programs/`)
- **`drift/`** — Core protocol (Anchor, ~500k+ lines of Rust). Entry point: `src/lib.rs`. Main instruction handlers in `src/instructions/`:
  - `user.rs` — trading instructions (place/cancel/fill orders)
  - `keeper.rs` — keeper/crank instructions (settle PnL, funding, liquidations)
  - `admin.rs` — admin/governance instructions
  - `lp_pool.rs`, `lp_admin.rs` — LP pool management
- **`pyth/`, `pyth-lazer/`, `switchboard/`, `switchboard-on-demand/`** — Oracle stubs/integrations (minimal, mostly `no-entrypoint` wrappers)
- **`openbook_v2/`, `token_faucet/`** — DEX integration and test utilities

### SDK (`sdk/`)
TypeScript library (`@drift-labs/sdk`). Key modules in `src/`:
- `driftClient.ts` — main client class
- `user.ts` — user account abstraction
- `dlob/` — Decentralized Limit Order Book implementation
- `math/` — pricing, margin, funding math
- `idl/drift.json` — generated Anchor IDL (do not edit manually)

### Tests (`tests/`)
~70 TypeScript integration tests using ts-mocha + Anchor's local validator (bankrun for some). Each test spins up a local validator with the program deployed. Tests are run serially by `run-anchor-tests.sh`.

### Program internals
- `programs/drift/src/math/` — core math (funding, fees, margin, AMM)
- `programs/drift/src/state/` — account structs (User, PerpMarket, SpotMarket, etc.)
- `programs/drift/src/controller/` — stateful operations (position updates, fills, liquidations)
- `programs/drift/src/validation/` — pre-instruction validation

### Doc comments

All modules have doc comments. When making feature or refactor changes, update any module-level doc comments that would be invalidated by the change.

### Error enum stability

The drift program's `Error` enum is ABI-stable — on-chain clients identify errors by numeric code. When modifying it:
- **Add** new variants at the **bottom** only, never insert between existing ones.
- **Remove** by marking the variant as deprecated (e.g., `/// @deprecated`) and leaving it in place — do not delete or reorder.

### Key design patterns
- Drift uses a custom native entrypoint (discriminator `[0xFF, 0xFF, 0xFF, 0xFF, opcode]`) for high-frequency keeper instructions that bypass Anchor overhead, alongside the standard Anchor `#[program]` entrypoint.
- `remaining_accounts` is used extensively to pass variable numbers of oracle accounts, spot markets, and maker accounts to instructions.
- Zero-copy account loading (`AccountLoader`) is used for large accounts (User, PerpMarket).
- Feature flags: `mainnet-beta` (production gates), `anchor-test` (enables test helpers), `no-entrypoint`/`cpi` (for SDK dependencies).
