import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { readGlobalOpts, withGlobalOptions } from '../lib/options';
import { buildAdminClient, buildProvider } from '../lib/provider';
import { reportDispatch, sendOrPropose } from '../lib/squads';

/**
 * Hot-tier convenience commands.
 *
 * Hot operations are normally run by automation (bots), not from a CLI. These
 * are included so an operator can manually invoke a role's action when a bot
 * is offline. `--multisig` works here too if the role key is itself a Squads
 * multisig (uncommon — hot keys are usually narrow-scope HSMs/keypairs).
 */
export function registerHot(parent: Command): void {
	const hot = parent
		.command('hot')
		.description(
			'HOT-tier operations (per-role, bot-callable). Authority: AdminAuthorityConfig.<role> OR warm OR cold.'
		);

	withGlobalOptions(
		hot
			.command('admin-deposit <market> <amount>')
			.description(
				'Admin deposit into a spot market on behalf of a user. Requires the `vault_deposit` hot role. <amount> is raw token units.'
			)
			.requiredOption(
				'--user <pubkey>',
				'target user account being credited'
			)
			.requiredOption(
				'--user-token-account <pubkey>',
				'admin signer ATA funding the deposit'
			)
	).action(async (market: string, amount: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const local = cmd.opts() as { user: string; userTokenAccount: string };
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await (client as any).getAdminDepositIx(
				Number.parseInt(market, 10),
				new BN(amount),
				new PublicKey(local.user),
				new PublicKey(local.userTokenAccount)
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin admin-deposit'
			);
			reportDispatch(
				`admin-deposit spot[${market}] amount=${amount} → ${local.user}`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});

	withGlobalOptions(
		hot
			.command('update-special-user-status <user> <status>')
			.description(
				'Toggle a per-user special status flag. Requires the `user_flag` hot role. <status> is a u8 bitfield.'
			)
	).action(async (user: string, status: string, _flags, cmd: Command) => {
		const opts = readGlobalOpts(cmd);
		const provider = buildProvider(opts);
		const client = await buildAdminClient(opts);
		try {
			const ix = await (client as any).getUpdateSpecialUserStatusIx(
				new PublicKey(user),
				Number.parseInt(status, 10)
			);
			const result = await sendOrPropose(
				provider,
				[ix],
				opts.multisig ? new PublicKey(opts.multisig) : undefined,
				'drift-admin update-special-user-status'
			);
			reportDispatch(
				`update-special-user-status ${user} = ${status}`,
				result
			);
		} finally {
			await client.unsubscribe();
		}
	});
}
