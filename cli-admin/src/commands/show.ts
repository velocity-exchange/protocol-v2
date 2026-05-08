import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { getAdminAuthorityConfigPublicKey, HotRole } from '@drift-labs/sdk';
import { readGlobalOpts, withGlobalOptions } from '../lib/options';
import { buildAdminClient } from '../lib/provider';

export function registerShow(parent: Command): void {
	const show = parent
		.command('show')
		.description('Read-only inspectors for the live admin authority state.');

	withGlobalOptions(
		show
			.command('config')
			.description(
				'Print the cold admin (state.admin), warm admin, and every hot-role pubkey from AdminAuthorityConfig.'
			)
	).action(async (_flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const client = await buildAdminClient(opts);
		try {
			const state = client.getStateAccount();
			const configPda = getAdminAuthorityConfigPublicKey(
				client.program.programId
			);
			const account = (client.program.account as any).adminAuthorityConfig;
			const config = (await account.fetchNullable(configPda)) as
				| Record<string, PublicKey>
				| null;

			console.log('cold admin (state.admin):', state.admin.toBase58());
			console.log('AdminAuthorityConfig PDA:', configPda.toBase58());
			if (!config) {
				console.log(
					'  (PDA not initialized — run `drift-admin warm init-admin-authority-config` first)'
				);
				return;
			}
			console.log('warm admin:', (config.warmAdmin as PublicKey).toBase58());
			for (const role of Object.values(HotRole)) {
				const value = (config as any)[role] as PublicKey | undefined;
				const display = value && !value.equals(PublicKey.default)
					? value.toBase58()
					: '(unset)';
				console.log(`hot.${role}:`, display);
			}
		} finally {
			await client.unsubscribe();
		}
	});
}
