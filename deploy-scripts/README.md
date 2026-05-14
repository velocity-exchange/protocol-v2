# deploy-scripts

Devnet deployment scripts for the drift program. The devnet quote token is **dUSDT** — a drift-controlled SPL mint created in Phase 0 and distributed via the `token_faucet` program. Internal env vars and identifiers still use `USDT` (e.g. `USDT_MINT`, `usdtMint`) for brevity; on-chain ticker / spot market name is `dUSDT`.

The devnet program id is read from `[programs.devnet].drift` in `Anchor.toml` — that and the `declare_id!` in `programs/drift/src/lib.rs` (Anchor enforces they match) are the source of truth. Override with `DRIFT_DEVNET_PROGRAM_ID=…` only for one-off testing.

## Program upgrades via CI (preferred)

Program upgrades to **mainnet** and **devnet** are gated through a Squads multisig and proposed by GitHub Actions; the scripts in this directory remain for emergency / direct deploys against the devnet upgrade keypair.

| Target | Trigger | Workflow |
| --- | --- | --- |
| **mainnet** | Push tag `program-drift-<version>` (e.g. `program-drift-2.163.0`) | [`.github/workflows/release-program.yaml`](../.github/workflows/release-program.yaml) |
| **devnet** | Run **Manual Devnet Program Deploy** from the Actions tab (pick program + branch) | [`.github/workflows/manual-devnet-deploy.yaml`](../.github/workflows/manual-devnet-deploy.yaml) |

Both workflows do the same thing on different multisigs:

1. Build the program — `anchor build` for the IDL, `solana-verify build` for a reproducible `.so` (Docker image pinned in workflow env). Devnet drift strips `mainnet-beta` so the cfg-gated `declare_id!` resolves to the devnet pubkey.
2. Upload the `.so` to a BPF Upgradeable Loader buffer (via `solana program write-buffer`).
3. Upload the IDL JSON to a program-metadata buffer (via `npx @solana-program/program-metadata create-buffer` — Anchor 1.0 stopped baking the legacy IDL instructions into programs).
4. Transfer both buffer authorities to the multisig vault PDA.
5. Call [`helium/squads-program-upgrade`](https://github.com/helium/squads-program-upgrade), which proposes a single Squads transaction containing: program-metadata `Initialize` (only if the canonical IDL metadata account doesn't exist yet) + `SetData` (apply IDL buffer) + `Close` (refund buffer rent) + BPF Loader `Upgrade` (apply program buffer). The proposal is **not** auto-executed — multisig signers approve + execute through the Squads UI.

### Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `MAINNET_RPC_ENDPOINT` / `DEVNET_RPC_ENDPOINT` | Solana RPC URLs (private RPC strongly recommended for mainnet — write-buffer needs ~1200 chunked writes). |
| `MAINNET_DEPLOYER_KEYPAIR` / `DEVNET_DEPLOYER_KEYPAIR` | Solana keypair as a raw `[..]` byte array. Pays buffer rent + signs the Squads proposal. Must be a multisig member with Voter permissions. |
| `MAINNET_DEPLOYER_ADDRESS` / `DEVNET_DEPLOYER_ADDRESS` | Public key of the deployer; receives reclaimed buffer rent on upgrade. |
| `MAINNET_MULTISIG` / `DEVNET_MULTISIG` | Squads multisig PDA. |
| `MAINNET_MULTISIG_VAULT` / `DEVNET_MULTISIG_VAULT` | The vault PDA owned by the multisig (Squads "vault index 0"). This is the on-chain program upgrade authority and the IDL metadata authority. |

The first-ever mainnet deploy with this flow will also **initialize the canonical IDL metadata account** for `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` — the action detects an absent metadata PDA and includes the `Initialize` instruction in the same Squads proposal. For drift mainnet, that account does not exist today.

### Cutting a mainnet release

```bash
# 1. Bump programs/drift/Cargo.toml version
# 2. Land that on mainnet-beta
git checkout mainnet-beta
git pull
# 3. Tag it
git tag program-drift-2.163.0
git push origin program-drift-2.163.0
# 4. Watch Actions → Release Program to Mainnet → wait for Squads proposal
# 5. Sign + execute in the Squads UI
```

The `mainnet-beta` branch tracks what is (or is about to be) live on mainnet; `master` is active development. The tag itself is the deploy trigger — branch state doesn't gate the workflow.

---

## Runbook

1. **Build** both programs (x86_64 toolchain; see root `CLAUDE.md`):
   ```
   bash deploy-scripts/build-devnet.sh
   ```
   Builds `drift` (no default features, no mainnet-beta gate, devnet `declare_id!`) and `token_faucet` (used to distribute devnet dUSDT). The deploy scripts read the devnet program id from `Anchor.toml`; you do not need to set `DRIFT_DEVNET_PROGRAM_ID` unless overriding for one-off testing.
2. **Deploy** (first time — fresh programs):
   - **Vanity program id + buffer (recommended for large drift.so uploads):** Build (`bash deploy-scripts/build-devnet.sh`), save your **program keypair JSON** whose pubkey matches `[programs.devnet].drift` in `Anchor.toml` under `deploy-scripts/out/` (gitignored). If you only have a recovery phrase / seed words, recover once:
     ```
     solana-keygen recover ASK -o deploy-scripts/out/drift-program-devnet.json --skip-seed-phrase-validation
     ```
     …paste your phrase when prompted (pass `--skip-seed-phrase-validation` if the words are not on the BIP39 English list). Then create the on-chain buffer and deploy from it:
     ```
     export DRIFT_DEVNET_UPGRADE_KEYPAIR=/path/to/admin-or-buffer-authority.json
     export PROGRAM_KEYPAIR=$PWD/deploy-scripts/out/drift-program-devnet.json
     bash deploy-scripts/write-buffer-devnet.sh
     BUFFER_ACCOUNT_KEYPAIR=$PWD/deploy-scripts/out/drift-so-write-buffer-keypair.json \
       PROGRAM_KEYPAIR=$PROGRAM_KEYPAIR bash deploy-scripts/deploy-from-buffer-devnet.sh
     ```
     If your vanity run only printed a short “seed” (e.g. `6IPs6rIASB0S38TO`), treat it as the custom word or passphrase your tool uses with the rest of its output; the recovered pubkey must equal `[programs.devnet].drift` from `Anchor.toml` — confirm with `solana-keygen pubkey` on the recovered JSON. The deploy scripts will reject a mismatching `PROGRAM_KEYPAIR`.
     Prefer a **private devnet RPC** via `SOLANA_RPC` or `RPC_URL` so `write-buffer` does not hit rate limits.

   - **Alternatively:** `anchor deploy --program-name drift` … `anchor deploy --program-name token_faucet` with devnet and `PROGRAM_KEYPAIR` / `--program-keypair`.

   For **subsequent upgrades** (same program id): `bash deploy-scripts/deploy-devnet.sh`. The script reads the program id from `Anchor.toml`; set `DRIFT_DEVNET_UPGRADE_KEYPAIR` (path to the upgrade authority keypair), or legacy `SOLANA_PATH` + `DEVNET_ADMIN`. Override `DRIFT_DEVNET_PROGRAM_ID=…` only for one-off testing against a non-canonical id.
3. **Sync IDL** into the SDK so the init script sees current instruction shapes:
   ```
   anchor build -- --features anchor-test && cp target/idl/drift.json sdk/src/idl/drift.json
   ```
4. **Initialize on-chain state** (phases 0 + A–H in one pass; idempotent):
   ```
   DEVNET_ADMIN=/path/to/admin.json \
   SOL_LAZER_FEED_ID=<u32 feed id> \
   PYTH_LAZER_TOKEN=<pyth lazer relay token> \
   bash deploy-scripts/init-devnet.sh
   ```
   Phase 0 creates a fresh 6-decimal dUSDT SPL mint, pre-mints `USDT_INITIAL_SUPPLY` (default 10M) to the admin ATA, then initializes the `token_faucet` for that mint — transferring mint authority to the faucet PDA so anyone can call `mint_to_user` for devnet dUSDT. The mint keypair is saved to `deploy-scripts/out/usdt-mint.json` (override via `USDT_MINT_KEYPAIR`); the resolved mint pubkey is persisted to the receipt. Re-runs reuse the same mint. To skip mint creation and reuse an existing mint, set `dUSDT_MINT=<pubkey>`.

   Phase C+ subscribes to Pyth Lazer over WSS and posts an initial signed price update for both feeds (SOL + USDT) — required because phase C2 (SOL spot) and phase D (SOL-PERP) call `get_oracle_price` at init, and so does phase E. Phase E runs `update_spot_market_oracle` to switch dUSDT from `QuoteAsset` (the program-mandated init source for spot[0]) to `PythLazerStableCoin` pointing at the USDT lazer PDA. **Phases F–H are optional** and can be skipped individually (`SKIP_PHASE_F/G/H=1`); a minimal functional devnet deploy is complete after Phase E.

   Writes a receipt to `deploy-scripts/out/devnet-deployment.json` with every created PDA, the dUSDT mint, the token_faucet config PDA, and tx signatures.

   Read-only verifier: `bun run deploy-scripts/verify-devnet.ts <SOL_FEED_ID> <USDT_FEED_ID>` derives every expected PDA from the configured program id and reports which exist on chain. Useful before/after to confirm what was created.
5. **Patch SDK constants** with values from the receipt — these ship as `PublicKey.default` placeholders until the deployment exists:
   - `sdk/src/config.ts` → `configs.devnet.QUOTE_MINT_ADDRESS` ← `usdtMint`
   - `sdk/src/constants/spotMarkets.ts` → `DevnetSpotMarkets[0].mint` ← `usdtMint`, `DevnetSpotMarkets[0].oracle` ← `pythLazerOracles[<usdtFeedId>].pubkey`, `DevnetSpotMarkets[1].oracle` ← `pythLazerOracles[<solFeedId>].pubkey`
   - `sdk/src/constants/perpMarkets.ts` → `DevnetPerpMarkets[0].oracle` ← `pythLazerOracles[<solFeedId>].pubkey`
   - `ui/src/config.ts` → `DRIFT_PROGRAM_ID` ← receipt `programId` (rebuild + redeploy the bundle)

## Distributing devnet dUSDT to test wallets

After Phase 0 the `token_faucet` program owns the dUSDT mint authority. Any wallet can request tokens by calling `token_faucet.mint_to_user(amount)` with their ATA — see `sdk/src/tokenFaucet.ts` for a TS client. The receipt records the faucet program id, `faucet_config` PDA, and `mint_authority` PDA so bots/scripts can wire up directly.

## Env vars

Required:
- `DEVNET_ADMIN` — path to admin keypair file; becomes `State.admin` **immutably** and the initial dUSDT mint authority (until Phase 0 hands it to the faucet PDA).
- `SOL_LAZER_FEED_ID` — Pyth Lazer u32 feed id for SOL/USD.
- `PYTH_LAZER_TOKEN` — auth token for the Pyth Lazer relay. Required because non-quote spot markets and perp markets call `get_oracle_price` at init, and `update_spot_market_oracle` (Phase E) does too — Phase C+ subscribes to the relay and posts a signed price update before the dependent phases run.

Optional:
- `USDT_LAZER_FEED_ID` — Pyth Lazer u32 feed id for USDT/USD (default `8`). The PythLazerOracle PDA for this feed becomes the dUSDT spot[0] oracle after Phase E.
- `PYTH_LAZER_ENDPOINTS` — comma-separated WSS endpoints (default `wss://pyth-lazer.dourolabs.app/v1/stream`).
- `PYTH_LAZER_WAIT_MS` — milliseconds to wait for the first signed price message before failing (default `30000`).
- `USDT_MINT` — reuse an existing dUSDT SPL mint (6 decimals) instead of creating one.
- `USDT_MINT_KEYPAIR` — path to the keypair for the mint to create (default `deploy-scripts/out/usdt-mint.json`). Use a vanity keypair if desired.
- `USDT_INITIAL_SUPPLY` — whole-token amount pre-minted to admin before the faucet takes mint authority (default `10000000`).
- `TOKEN_FAUCET_PROGRAM_ID` — override (default `V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB`).
- `RPC_URL` (default `https://api.devnet.solana.com`)
- `LP_POOL_ID` (default `1`; id `0` is the "not in a pool" sentinel)
- `LP_MAX_AUM` (default `1_000_000`, multiplied by `QUOTE_PRECISION`)
- `PROTECTED_MAKER_MAX_USERS` (default `200`)
- `RECEIPT_PATH` (default `deploy-scripts/out/devnet-deployment.json`)
- `SKIP_PHASE_C2=1`, `SKIP_PHASE_D=1`, `SKIP_PHASE_E=1`, `SKIP_PHASE_F=1`, `SKIP_PHASE_G=1`, `SKIP_PHASE_H=1` — bypass individual phases. **Phases F/G/H are optional** (IF shares transfer config / LP pool / protected maker mode) — skip freely. Phase F's program entrypoint (`initialize_protocol_if_shares_transfer_config`) is currently commented out in `programs/drift/src/lib.rs`, so set `SKIP_PHASE_F=1` until it's re-enabled. Phase E (oracle switch) is **required** for a functional dUSDT spot[0] — only skip during partial re-runs.
- `NON_INTERACTIVE=1` (or `YES=1`) — skip every confirmation prompt; useful for CI

By default the script pauses before pre-flight and before each phase (0 + A–H), printing the resolved inputs (mint, oracle, LP id, etc.) and waiting for `y` to continue. Pre-flight verifies both the drift and token_faucet programs are deployed/executable, and that any caller-supplied `USDT_MINT` is a real token mint, before any state is touched.

## What gets initialized

See `.claude/plans/drift-devnet-deployment.md` for the authoritative plan. Summary:

Required phases (0 → E):

- **0**  dUSDT SPL mint (6 dec) + `token_faucet` initialized for that mint
- **A**  global `State` + `AmmCache`
- **B**  dUSDT spot market at index 0 (oracle source forced by program to `QuoteAsset`)
- **C**  Pyth Lazer SOL + USDT oracle PDAs (created empty)
- **C+** post initial Pyth Lazer signed price update for both feeds (one tx)
- **C2** SOL spot market at index 1 (uses SOL Pyth Lazer oracle)
- **D**  SOL-PERP at index 0 (uses SOL Pyth Lazer oracle)
- **E**  switch dUSDT spot market oracle to `PythLazerStableCoin` pointing at the USDT lazer PDA — required because the program forces `QuoteAsset` at init for spot[0] (`admin.rs:217-228`); the only path to `PythLazerStableCoin` is the post-init `update_spot_market_oracle` ix.

Optional phases (skip individually with `SKIP_PHASE_F/G/H=1`):

- **F**  `ProtocolIfSharesTransferConfig` *(currently disabled in `lib.rs`; set `SKIP_PHASE_F=1`)*
- **G**  LP pool + dUSDT constituent
- **H**  `ProtectedMakerModeConfig`

Skipped by design (left for later):
- Additional spot markets beyond dUSDT/SOL (BTC, ETH, …)
- `initializeIfRebalanceConfig` (needs ≥2 spot markets — currently satisfied; can be enabled)
- Spot DEX fulfillment (OpenBook V2 / Phoenix / Serum)
- User-invoked flows: `initializeInsuranceFundStake`, `initializeReferrerName`

## Verification

After the script finishes, confirm the program is live (program id from `Anchor.toml`):

```
solana program show "$(sh -c '. deploy-scripts/_lib.sh; drift_devnet_program_id')" --url devnet
```

Then run the read-only verifier — derives every expected PDA and reports which exist:

```
bun run deploy-scripts/verify-devnet.ts <SOL_FEED_ID> <USDT_FEED_ID>
# e.g. bun run deploy-scripts/verify-devnet.ts 6 8
```

Or inspect the receipt and spot-check with `solana account <pubkey> --url devnet`.

End-to-end smoke: use a second wallet to call `DriftClient.initializeUserAccount()` → `deposit(usdtAmount, 0)` → `placePerpOrder({ marketIndex: 0, ... })` and observe a keeper fill.

## Operational notes (learned on first deploy)

- **Use a private RPC for `solana program` writes.** The public `api.devnet.solana.com` rate-limits the ~1200 chunked writes an upgrade requires and fails partway through with `Data writes to account failed: Custom error: Max retries exceeded`, leaving an orphan buffer that locks ~38 SOL. Pass a private RPC via `anchor upgrade --provider.cluster <url>` (or edit `deploy-devnet.sh` similarly). `RPC_URL` covers the init script. Drift has a Triton pool at `https://drift-drift-a827.devnet.rpcpool.com/<token>` — see user memory `reference_drift_devnet_rpc.md`.
- **If a buffer is orphaned, reclaim the SOL** with `solana program show --buffers --buffer-authority <admin>` then `solana program close <buffer> --keypair <admin>` — rent is refunded to the admin wallet.
- **`anchor build` for the drift keypair mismatch:** the checked-in `target/deploy/drift-keypair.json` is a placeholder, so `anchor build` fails with "Program ID mismatch" on a clean checkout. Pass `--ignore-keys` — the deployed program id is hard-coded in source and the local keypair is unused for upgrade.
- **`bun` strict type-only re-exports:** `bun run deploy-scripts/init-devnet.ts` fails if the SDK re-exports a type without the `type` keyword (e.g. `export { PythLazerPriceFeedArray }`). This was fixed in `sdk/src/index.ts` and `sdk/src/pyth/index.ts`; keep an eye on it when adding new SDK exports.
- **Pyth Lazer message must include `feedUpdateTimestamp`.** The on-chain `post_pyth_lazer_oracle_update` ix silently skips updates whose payload lacks `FeedUpdateTimestamp` (`programs/drift/src/instructions/pyth_lazer_oracle.rs:99-102`) — the tx returns Ok with no on-chain write, and the next phase fails with `Unable to read oracle price`. Phase C+ subscribes with `feedUpdateTimestamp` plus `bestBid/AskPrice` (used for confidence) and `exponent`; do not strip these properties.
- **dUSDT oracle is a two-step init.** `handle_initialize_spot_market` (`admin.rs:217-228`) hard-requires the quote spot market to be `OracleSource::QuoteAsset` with `oracle = Pubkey::default()`. Switching to `PythLazerStableCoin` afterwards is done in Phase E via `update_spot_market_oracle`, which itself reads the new oracle (`admin.rs:1295-1300`) — so the USDT lazer PDA must already have a posted price. This is why Phase C+ runs before Phase E and must succeed.
