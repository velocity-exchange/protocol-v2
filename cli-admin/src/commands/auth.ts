import { Command } from 'commander';
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

export function registerAuth(parent: Command): void {
	const auth = parent
		.command('auth')
		.description(
			'Authority management: rotate the admin keys held by State and AdminAuthorityConfig.'
		);

	withGlobalOptions(
		auth
			.command('set-admin <newAdmin>')
			.description(
				'Rotate state.admin (cold). On-chain check requires the existing cold admin to sign.'
			)
	).action(async (newAdmin: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await client.getUpdateAdminIx(new PublicKey(newAdmin));
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin auth set-admin'
			);
			reportDispatch(`set-admin → ${newAdmin}`, result);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		auth
			.command('set-warm-admin <newWarmAdmin>')
			.description(
				'Rotate AdminAuthorityConfig.warm_admin (the multisig+timelock pubkey). On-chain check requires cold to sign.'
			)
	).action(async (newWarmAdmin: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await client.getUpdateWarmAdminIx(new PublicKey(newWarmAdmin));
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin auth set-warm-admin'
			);
			reportDispatch(`set-warm-admin → ${newWarmAdmin}`, result);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		auth
			.command('set-hot-admin <role> <pubkey>')
			.description(
				`Rotate a hot-role pubkey. Roles: ${HOT_ROLES.join(', ')}. On-chain check requires warm or cold to sign.`
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
				`drift-admin auth set-hot-admin ${role}`
			);
			reportDispatch(`set-hot-admin ${role} → ${pubkey}`, result);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		auth
			.command('init-config')
			.description(
				'One-time creation of the AdminAuthorityConfig PDA (post-program-upgrade migration). On-chain check requires cold (or warm via the cold-path on existing deployments).'
			)
			.option(
				'--initial-warm <pubkey>',
				'initial warm_admin pubkey (defaults to current state.admin)'
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
				'drift-admin auth init-config'
			);
			reportDispatch(
				`init-config (warm=${initialWarm.toBase58()})`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});
}
