# drift-admin

CLI for Drift v2 cold/warm/hot tier admin operations, with optional Squads V4 multisig dispatch.

## Setup

```sh
cd cli-admin
bun install
```

## Usage

```sh
bun run start --help
```

Or, if linked into your `$PATH`:

```sh
drift-admin --help
```

### Common operations

```sh
# Inspect current authorities
drift-admin show config

# Cold rotation (rare; usually after warm key compromise)
drift-admin cold update-warm-admin <newPubkey>

# Warm one-time setup post-upgrade
drift-admin warm init-admin-authority-config

# Rotate a hot-role signer
drift-admin warm update-hot-admin ammCrank <newPubkey>

# Pause spot market 0
drift-admin warm update-spot-market-status 0 ReduceOnly
```

### Routing through a Squads V4 multisig

Append `--multisig <multisigPda>` to any subcommand. The CLI submits a single
transaction that creates a `vault_transaction` + `proposal` against the
multisig, with the wallet as the proposer. Members then approve + execute via
Squads.

```sh
drift-admin cold update-warm-admin <newWarmAdmin> \
  --multisig <multisigPda> \
  --keypair ~/cold-proposer.json
```

### Generic dispatcher

For any drift instruction without a dedicated wrapper:

```sh
drift-admin call <camelCaseIxName> <payloadFile.json>
```

Example payload:

```json
{
	"args": { "withdrawGuardThreshold": "1000000000" },
	"accounts": {
		"spotMarket": "…",
		"state": "…",
		"adminAuthorityConfig": "…",
		"admin": "…"
	}
}
```

The dispatcher does no PDA derivation — every account must be supplied. It's
the escape hatch; prefer the named commands.

## Global options

| Flag                     | Default                                         |
| ------------------------ | ----------------------------------------------- |
| `-u, --url <url>`        | `https://api.mainnet-beta.solana.com`           |
| `-k, --keypair <path>`   | `~/.config/solana/id.json`                      |
| `-e, --env <env>`        | `mainnet-beta` (or `devnet`)                    |
| `-m, --multisig <pubkey>`| (none — direct send)                            |
