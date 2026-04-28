#!/bin/sh
set -eu

DRIFT_DEVNET_PROGRAM_ID="${DRIFT_DEVNET_PROGRAM_ID:-vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P}"

if [ -n "${DRIFT_DEVNET_UPGRADE_KEYPAIR:-}" ]; then
	UPGRADE_KEYPAIR="$DRIFT_DEVNET_UPGRADE_KEYPAIR"
elif [ -n "${SOLANA_PATH:-}" ] && [ -n "${DEVNET_ADMIN:-}" ]; then
	UPGRADE_KEYPAIR="$SOLANA_PATH/$DEVNET_ADMIN"
else
	echo "deploy-devnet.sh: set DRIFT_DEVNET_UPGRADE_KEYPAIR (recommended), or both SOLANA_PATH and DEVNET_ADMIN" >&2
	exit 1
fi

anchor upgrade \
	--program-id "$DRIFT_DEVNET_PROGRAM_ID" \
	--provider.cluster devnet \
	--provider.wallet "$UPGRADE_KEYPAIR" \
	target/deploy/drift.so
