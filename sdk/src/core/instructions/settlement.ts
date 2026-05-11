import type {
	AccountMeta,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import type { DriftProgram } from '../../config';

export async function buildSettlePnlInstruction(args: {
	program: DriftProgram;
	marketIndex: number;
	state: PublicKey;
	authority: PublicKey;
	user: PublicKey;
	spotMarketVault: PublicKey;
	remainingAccounts: AccountMeta[];
}): Promise<TransactionInstruction> {
	return await (args.program.instruction as any).settlePnl(args.marketIndex, {
		accounts: {
			state: args.state,
			authority: args.authority,
			user: args.user,
			spotMarketVault: args.spotMarketVault,
		},
		remainingAccounts: args.remainingAccounts,
	});
}
