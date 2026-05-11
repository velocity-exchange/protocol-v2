import type {
	AccountMeta,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import type { DriftProgram } from '../../config';

export async function buildPlaceOrdersInstruction(args: {
	program: DriftProgram;
	formattedParams: any[];
	state: PublicKey;
	user: PublicKey;
	userStats: PublicKey;
	authority: PublicKey;
	remainingAccounts: AccountMeta[];
}): Promise<TransactionInstruction> {
	return await (args.program.instruction as any).placeOrders(
		args.formattedParams,
		{
			accounts: {
				state: args.state,
				user: args.user,
				userStats: args.userStats,
				authority: args.authority,
			},
			remainingAccounts: args.remainingAccounts,
		}
	);
}

export async function buildCancelOrdersInstruction(args: {
	program: DriftProgram;
	marketType: any;
	marketIndex: number | null;
	direction: any;
	user: PublicKey;
	state: PublicKey;
	userStats: PublicKey;
	authority: PublicKey;
	remainingAccounts: AccountMeta[];
}): Promise<TransactionInstruction> {
	return await (args.program.instruction as any).cancelOrders(
		args.marketType,
		args.marketIndex,
		args.direction,
		{
			accounts: {
				state: args.state,
				user: args.user,
				userStats: args.userStats,
				authority: args.authority,
			},
			remainingAccounts: args.remainingAccounts,
		}
	);
}
