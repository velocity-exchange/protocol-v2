import { describe, expect, test } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { DriftCore } from '../../src/core/DriftCore';

describe('DriftCore perp order instruction builders', () => {
	const pk = () => Keypair.generate().publicKey;
	const fakeIx = {
		keys: [],
		programId: Keypair.generate().publicKey,
		data: Buffer.alloc(0),
	};

	test('buildPlacePerpOrderInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				placePerpOrder: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ix = await DriftCore.buildPlacePerpOrderInstruction({
			program,
			orderParams: { x: 1 },
			state: pk(),
			user: pk(),
			userStats: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toEqual({ x: 1 });
	});

	test('buildPlaceAndTakePerpOrderInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				placeAndTakePerpOrder: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ix = await DriftCore.buildPlaceAndTakePerpOrderInstruction({
			program,
			orderParams: { m: 0 },
			optionalParams: 256,
			state: pk(),
			user: pk(),
			userStats: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][1]).toBe(256);
	});

	test('buildPlaceAndMakePerpOrderInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				placeAndMakePerpOrder: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ix = await DriftCore.buildPlaceAndMakePerpOrderInstruction({
			program,
			orderParams: {},
			takerOrderId: 7,
			state: pk(),
			user: pk(),
			userStats: pk(),
			taker: pk(),
			takerStats: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][1]).toBe(7);
	});

	test('buildCancelOrderInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				cancelOrder: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ix = await DriftCore.buildCancelOrderInstruction({
			program,
			orderId: 3,
			state: pk(),
			user: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toBe(3);
	});

	test('buildCancelOrderByUserIdInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				cancelOrderByUserId: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ix = await DriftCore.buildCancelOrderByUserIdInstruction({
			program,
			userOrderId: 9,
			state: pk(),
			user: pk(),
			authority: pk(),
			oracle: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toBe(9);
	});

	test('buildCancelOrdersByIdsInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				cancelOrdersByIds: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const ids = [1, 2];
		const ix = await DriftCore.buildCancelOrdersByIdsInstruction({
			program,
			orderIds: ids,
			state: pk(),
			user: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toBe(ids);
	});

	test('buildModifyOrderInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				modifyOrder: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const mp = { baseAssetAmount: null };
		const ix = await DriftCore.buildModifyOrderInstruction({
			program,
			orderId: 4,
			modifyParams: mp,
			state: pk(),
			user: pk(),
			userStats: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toBe(4);
		expect(called[0][1]).toBe(mp);
	});

	test('buildModifyOrderByUserIdInstruction', async () => {
		const called: any[] = [];
		const program = {
			instruction: {
				modifyOrderByUserId: async (...args: any[]) => {
					called.push(args);
					return fakeIx;
				},
			},
		};
		const mp = { reduceOnly: false };
		const ix = await DriftCore.buildModifyOrderByUserIdInstruction({
			program,
			userOrderId: 11,
			modifyParams: mp,
			state: pk(),
			user: pk(),
			userStats: pk(),
			authority: pk(),
			remainingAccounts: [],
		});
		expect(ix).toBe(fakeIx as any);
		expect(called[0][0]).toBe(11);
		expect(called[0][1]).toBe(mp);
	});
});
