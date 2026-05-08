import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { HotRole } from '@drift-labs/sdk';
import { readGlobalOpts, withGlobalOptions } from '../lib/options';
import { buildAdminClient, buildProvider } from '../lib/provider';
import { reportDispatch, sendOrPropose } from '../lib/squads';

const HOT_ROLES = Object.values(HotRole) as string[];

function parseHotRole(raw: string): HotRole {
	if (!HOT_ROLES.includes(raw)) {
		throw new Error(
			`unknown hot role "${raw}" (expected one of: ${HOT_ROLES.join(', ')})`
		);
	}
	return raw as HotRole;
}

export function registerWarm(parent: Command): void {
	const warm = parent
		.command('warm')
		.description(
			'WARM-tier operations. Authority: AdminAuthorityConfig.warm_admin (multisig+timelock). Day-to-day governance — pauses, market init, oracle changes, parameter tuning. Cold can also call (cold ⊇ warm).'
		);

	withGlobalOptions(
		warm
			.command('init-admin-authority-config')
			.description(
				'Create the AdminAuthorityConfig PDA. One-time post-upgrade setup; pass --multisig if cold key is a Squads multisig.'
			)
			.option(
				'--initial-warm <pubkey>',
				'initial warm_admin pubkey (defaults to current cold admin)'
			)
	).action(async (_flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const local = cmd.opts() as { initialWarm?: string };
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const initialWarm = local.initialWarm
				? new PublicKey(local.initialWarm)
				: client.getStateAccount().admin;
			const ix = await client.getInitializeAdminAuthorityConfigIx(initialWarm);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin init-admin-authority-config'
			);
			reportDispatch(
				`init-admin-authority-config (warm=${initialWarm.toBase58()})`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		warm
			.command('update-hot-admin <role> <pubkey>')
			.description(
				`Rotate a hot-role pubkey. Roles: ${HOT_ROLES.join(', ')}.`
			)
	).action(async (role: string, pubkey: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await client.getUpdateHotAdminIx(
				parseHotRole(role),
				new PublicKey(pubkey)
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				`drift-admin update-hot-admin ${role}`
			);
			reportDispatch(`update-hot-admin ${role} → ${pubkey}`, result);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		warm
			.command('update-withdraw-guard-threshold <market> <threshold>')
			.description(
				'Set per-market withdraw guard threshold (raw u64; visible during timelock window).'
			)
	).action(async (market: string, threshold: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await (client as any).getUpdateWithdrawGuardThresholdIx(
				Number.parseInt(market, 10),
				new BN(threshold)
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin update-withdraw-guard-threshold'
			);
			reportDispatch(
				`update-withdraw-guard-threshold spot[${market}] = ${threshold}`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		warm
			.command('update-perp-market-status <market> <status>')
			.description(
				'Set a perp market status. Status: Active | Paused | ReduceOnly | Settlement | Delisted | Initialized.'
			)
	).action(async (market: string, status: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const enumVariant: { [k: string]: Record<string, never> } = {
				[status.charAt(0).toLowerCase() + status.slice(1)]: {},
			};
			const ix = await (client as any).getUpdatePerpMarketStatusIx(
				Number.parseInt(market, 10),
				enumVariant
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin update-perp-market-status'
			);
			reportDispatch(
				`update-perp-market-status perp[${market}] = ${status}`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		warm
			.command('update-spot-market-status <market> <status>')
			.description(
				'Set a spot market status. Status: Active | Paused | ReduceOnly | Settlement | Delisted | Initialized.'
			)
	).action(async (market: string, status: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const enumVariant: { [k: string]: Record<string, never> } = {
				[status.charAt(0).toLowerCase() + status.slice(1)]: {},
			};
			const ix = await (client as any).getUpdateSpotMarketStatusIx(
				Number.parseInt(market, 10),
				enumVariant
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin update-spot-market-status'
			);
			reportDispatch(
				`update-spot-market-status spot[${market}] = ${status}`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		warm
			.command('update-exchange-status <status>')
			.description(
				'Set the global exchange status (whole-protocol pause). Status: bitfield uint, e.g. 0=active, 1=depositPaused, 2=withdrawPaused, 4=ammPaused, 8=fillPaused, 16=liqPaused, 32=fundingPaused, 64=settlePnlPaused.'
			)
	).action(async (status: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await (client as any).getUpdateExchangeStatusIx(
				Number.parseInt(status, 10)
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin update-exchange-status'
			);
			reportDispatch(`update-exchange-status = ${status}`, result);
		} finally {
			await client.unsubscribe();
		}
	});
}
