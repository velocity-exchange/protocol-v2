# deploy-scripts

Devnet deployment scripts for the drift program. The devnet quote token is **dUSDT** — a drift-controlled SPL mint created in Phase 0 and distributed via the `token_faucet` program. Internal env vars and identifiers still use `USDT` (e.g. `USDT_MINT`, `usdtMint`) for brevity; on-chain ticker / spot market name is `dUSDT`.

## Runbook

1. **Build** both programs (x86_64 toolchain; see root `CLAUDE.md`):
   ```
   bash deploy-scripts/build-devnet.sh
   ```
   Builds `drift` (no default features, no mainnet-beta gate) and `token_faucet` (used to distribute devnet dUSDT).
2. **Deploy** (first time — fresh programs): use `anchor deploy --program-name drift` and `anchor deploy --program-name token_faucet` with the devnet cluster and your admin keypair; for subsequent upgrades use `bash deploy-scripts/deploy-devnet.sh`.
3. **Sync IDL** into the SDK so the init script sees current instruction shapes:
   ```
   anchor build -- --features anchor-test && cp target/idl/drift.json sdk/src/idl/drift.json
   ```
4. **Initialize on-chain state** (phases 0 + A–G in one pass; idempotent):
   ```
   DEVNET_ADMIN=/path/to/admin.json \
   SOL_LAZER_FEED_ID=<u32 feed id> \
   bash deploy-scripts/init-devnet.sh
   ```
   Phase 0 creates a fresh 6-decimal dUSDT SPL mint, pre-mints `USDT_INITIAL_SUPPLY` (default 10M) to the admin ATA, then initializes the `token_faucet` for that mint — transferring mint authority to the faucet PDA so anyone can call `mint_to_user` for devnet dUSDT. The mint keypair is saved to `deploy-scripts/out/usdt-mint.json` (override via `USDT_MINT_KEYPAIR`); the resolved mint pubkey is persisted to the receipt. Re-runs reuse the same mint. To skip mint creation and reuse an existing mint, set `dUSDT_MINT=<pubkey>`.

   Writes a receipt to `deploy-scripts/out/devnet-deployment.json` with every created PDA, the dUSDT mint, the token_faucet config PDA, and tx signatures.
5. **Patch SDK constants** with values from the receipt — these ship as `PublicKey.default` placeholders until the deployment exists:
   - `sdk/src/config.ts` → `configs.devnet.QUOTE_MINT_ADDRESS` ← `usdtMint`
   - `sdk/src/constants/spotMarkets.ts` → `DevnetSpotMarkets[0].mint` ← `usdtMint`
   - `sdk/src/constants/perpMarkets.ts` → `DevnetPerpMarkets[0].oracle` ← `pythLazerOracles[<feedId>].pubkey`

## Distributing devnet dUSDT to test wallets

After Phase 0 the `token_faucet` program owns the dUSDT mint authority. Any wallet can request tokens by calling `token_faucet.mint_to_user(amount)` with their ATA — see `sdk/src/tokenFaucet.ts` for a TS client. The receipt records the faucet program id, `faucet_config` PDA, and `mint_authority` PDA so bots/scripts can wire up directly.

## Env vars

Required:
- `DEVNET_ADMIN` — path to admin keypair file; becomes `State.admin` **immutably** and the initial dUSDT mint authority (until Phase 0 hands it to the faucet PDA).
- `SOL_LAZER_FEED_ID` — Pyth Lazer u32 feed id for SOL/USD.

Optional:
- `USDT_MINT` — reuse an existing dUSDT SPL mint (6 decimals) instead of creating one.
- `USDT_MINT_KEYPAIR` — path to the keypair for the mint to create (default `deploy-scripts/out/usdt-mint.json`). Use a vanity keypair if desired.
- `USDT_INITIAL_SUPPLY` — whole-token amount pre-minted to admin before the faucet takes mint authority (default `10000000`).
- `TOKEN_FAUCET_PROGRAM_ID` — override (default `V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB`).
- `RPC_URL` (default `https://api.devnet.solana.com`)
- `LP_POOL_ID` (default `1`; id `0` is the "not in a pool" sentinel)
- `LP_MAX_AUM` (default `1_000_000`, multiplied by `QUOTE_PRECISION`)
- `PROTECTED_MAKER_MAX_USERS` (default `200`)
- `RECEIPT_PATH` (default `deploy-scripts/out/devnet-deployment.json`)
- `NON_INTERACTIVE=1` (or `YES=1`) — skip every confirmation prompt; useful for CI

By default the script pauses before pre-flight and before each phase (0 + A–G), printing the resolved inputs (mint, oracle, LP id, etc.) and waiting for `y` to continue. Pre-flight verifies both the drift and token_faucet programs are deployed/executable, and that any caller-supplied `USDT_MINT` is a real token mint, before any state is touched.

## What gets initialized

See `.claude/plans/drift-devnet-deployment.md` for the authoritative plan. Summary:

- **0** dUSDT SPL mint (6 dec) + `token_faucet` initialized for that mint
- **A** global `State` + `AmmCache`
- **B** dUSDT spot market at index 0
- **C** Pyth Lazer SOL/USD oracle
- **D** SOL-PERP at index 0
- **E** `ProtocolIfSharesTransferConfig`
- **F** LP pool + dUSDT constituent
- **G** `ProtectedMakerModeConfig`

Skipped by design (left for later):
- Additional spot markets (SOL, BTC, …)
- `initializeIfRebalanceConfig` (needs ≥2 spot markets)
- Spot DEX fulfillment (OpenBook V2 / Phoenix / Serum)
- User-invoked flows: `initializeInsuranceFundStake`, `initializeReferrerName`

## Verification

After the script finishes, confirm:

```
solana program show dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH --url devnet
```

Then inspect the receipt for every PDA and cross-check with `solana account <pubkey> --url devnet`.

End-to-end smoke: use a second wallet to call `DriftClient.initializeUserAccount()` → `deposit(usdtAmount, 0)` → `placePerpOrder({ marketIndex: 0, ... })` and observe a keeper fill.

## Operational notes (learned on first deploy)

- **Use a private RPC for `solana program` writes.** The public `api.devnet.solana.com` rate-limits the ~1200 chunked writes an upgrade requires and fails partway through with `Data writes to account failed: Custom error: Max retries exceeded`, leaving an orphan buffer that locks ~38 SOL. Pass a private RPC via `anchor upgrade --provider.cluster <url>` (or edit `deploy-devnet.sh` similarly). `RPC_URL` covers the init script. Drift has a Triton pool at `https://drift-drift-a827.devnet.rpcpool.com/<token>` — see user memory `reference_drift_devnet_rpc.md`.
- **If a buffer is orphaned, reclaim the SOL** with `solana program show --buffers --buffer-authority <admin>` then `solana program close <buffer> --keypair <admin>` — rent is refunded to the admin wallet.
- **`anchor build` for the drift keypair mismatch:** the checked-in `target/deploy/drift-keypair.json` is a placeholder, so `anchor build` fails with "Program ID mismatch" on a clean checkout. Pass `--ignore-keys` — the deployed program id is hard-coded in source and the local keypair is unused for upgrade.
- **`bun` strict type-only re-exports:** `bun run deploy-scripts/init-devnet.ts` fails if the SDK re-exports a type without the `type` keyword (e.g. `export { PythLazerPriceFeedArray }`). This was fixed in `sdk/src/index.ts` and `sdk/src/pyth/index.ts`; keep an eye on it when adding new SDK exports.
