# drift-admin

CLI for Drift v2 admin operations. Sign with the right key (or pass a Squads
V4 multisig); the on-chain program enforces which tier of authority is
required for the action.

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

## Commands

```
drift-admin show config

drift-admin auth set-admin <pubkey>
drift-admin auth set-warm-admin <pubkey>
drift-admin auth set-hot-admin <role> <pubkey>
drift-admin auth init-config [--initial-warm <pk>]

drift-admin perp-market set-status <market> <status>
drift-admin spot-market set-status <market> <status>
drift-admin spot-market set-guard-threshold <market> <threshold>

drift-admin exchange set-status <bitfield>

drift-admin user set-special-status <user> <flags>
drift-admin user admin-deposit <market> <amount> --user <pk> --user-token-account <pk>

drift-admin call <ixName> <payloadFile>     # generic IDL escape hatch
```

## Routing through a Squads V4 multisig

Append `--multisig <multisigPda>` to any subcommand. The CLI submits a single
transaction that creates a `vault_transaction` + `proposal` against the
multisig with your wallet as the proposer. Members then approve + execute via
the Squads UI.

```sh
drift-admin auth set-warm-admin <newWarmAdmin> \
  --multisig <multisigPda> \
  --keypair ~/cold-proposer.json
```

## Generic dispatcher

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

The dispatcher does no PDA derivation — every account must be supplied.

## Global options

| Flag                      | Default                               |
| ------------------------- | ------------------------------------- |
| `-u, --url <url>`         | `https://api.mainnet-beta.solana.com` |
| `-k, --keypair <path>`    | `~/.config/solana/id.json`            |
| `-e, --env <env>`         | `mainnet-beta` (or `devnet`)          |
| `-m, --multisig <pubkey>` | (none — direct send)                  |
