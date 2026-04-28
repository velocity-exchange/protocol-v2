#!/bin/sh
# First-time program deploy on devnet from a buffer created by write-buffer-devnet.sh
# (same cluster + upgrade authority). Re-runs after the program exists: use
# deploy-scripts/deploy-devnet.sh (anchor upgrade) instead.
#
# Env:
#   BUFFER_ACCOUNT_KEYPAIR   required — same file passed to write-buffer-devnet.sh
#   PROGRAM_KEYPAIR          required — JSON keypair whose pubkey is DRIFT_DEVNET_PROGRAM_ID
#   DRIFT_DEVNET_PROGRAM_ID  default matches declare_id! / Anchor.toml devnet
#   PROGRAM_SO               default target/deploy/drift.so (ELF sanity check)
#   DRIFT_DEVNET_UPGRADE_KEYPAIR | SOLANA_PATH+DEVNET_ADMIN — upgrade authority
#   SOLANA_RPC / RPC_URL

set -eu

DRIFT_DEVNET_PROGRAM_ID="${DRIFT_DEVNET_PROGRAM_ID:-vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P}"
PROGRAM_SO="${PROGRAM_SO:-target/deploy/drift.so}"
SOLANA_RPC="${SOLANA_RPC:-${RPC_URL:-https://api.devnet.solana.com}}"

BUFFER_ACCOUNT_KEYPAIR="${BUFFER_ACCOUNT_KEYPAIR:?Set BUFFER_ACCOUNT_KEYPAIR (output from write-buffer-devnet.sh)}"
PROGRAM_KEYPAIR="${PROGRAM_KEYPAIR:?Set PROGRAM_KEYPAIR — JSON file for program id $DRIFT_DEVNET_PROGRAM_ID}"

if [ ! -f "$BUFFER_ACCOUNT_KEYPAIR" ]; then
	echo "BUFFER_ACCOUNT_KEYPAIR not found: $BUFFER_ACCOUNT_KEYPAIR" >&2
	exit 1
fi
if [ ! -f "$PROGRAM_KEYPAIR" ]; then
	echo "PROGRAM_KEYPAIR not found: $PROGRAM_KEYPAIR" >&2
	exit 1
fi
if [ ! -f "$PROGRAM_SO" ]; then
	echo "Missing $PROGRAM_SO — run: bash deploy-scripts/build-devnet.sh" >&2
	exit 1
fi

KP=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
if [ "$KP" != "$DRIFT_DEVNET_PROGRAM_ID" ]; then
	echo "PROGRAM_KEYPAIR pubkey $KP != DRIFT_DEVNET_PROGRAM_ID $DRIFT_DEVNET_PROGRAM_ID" >&2
	exit 1
fi

if [ -n "${DRIFT_DEVNET_UPGRADE_KEYPAIR:-}" ]; then
	UPGRADE_KEYPAIR="$DRIFT_DEVNET_UPGRADE_KEYPAIR"
elif [ -n "${SOLANA_PATH:-}" ] && [ -n "${DEVNET_ADMIN:-}" ]; then
	UPGRADE_KEYPAIR="$SOLANA_PATH/$DEVNET_ADMIN"
else
	echo "Set DRIFT_DEVNET_UPGRADE_KEYPAIR, or both SOLANA_PATH and DEVNET_ADMIN" >&2
	exit 1
fi

solana program deploy "$PROGRAM_SO" \
	-u "$SOLANA_RPC" \
	--buffer "$BUFFER_ACCOUNT_KEYPAIR" \
	--program-id "$PROGRAM_KEYPAIR" \
	--upgrade-authority "$UPGRADE_KEYPAIR"

echo "Deployed program $DRIFT_DEVNET_PROGRAM_ID"
