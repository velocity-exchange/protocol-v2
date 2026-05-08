import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { readGlobalOpts, withGlobalOptions } from '../lib/options';
import { buildAdminClient, buildProvider } from '../lib/provider';
import { reportDispatch, sendOrPropose } from '../lib/squads';

export function registerCold(parent: Command): void {
	const cold = parent
		.command('cold')
		.description(
			'COLD-tier operations. Authority: state.admin. Use as rarely as possible — primarily for rotating warm or cold itself.'
		);

	withGlobalOptions(
		cold
			.command('update-admin <newAdmin>')
			.description('Rotate the cold admin (state.admin). [COLD]')
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
				'drift-admin update-admin'
			);
			reportDispatch(`update-admin → ${newAdmin}`, result);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		cold
			.command('update-warm-admin <newWarmAdmin>')
			.description(
				'Rotate the warm admin pubkey on AdminAuthorityConfig. The kill-switch when warm is compromised. [COLD]'
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
				'drift-admin update-warm-admin'
			);
			reportDispatch(`update-warm-admin → ${newWarmAdmin}`, result);
		} finally {
			await client.unsubscribe();
		}
	});
}
