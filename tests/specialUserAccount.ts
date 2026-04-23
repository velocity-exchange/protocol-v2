import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { assert } from 'chai';
import { startAnchor } from 'solana-bankrun';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
	BN,
	BASE_PRECISION,
	getMarketOrderParams,
	MarketStatus,
	OracleSource,
	PEG_PRECISION,
	PositionDirection,
	QUOTE_SPOT_MARKET_INDEX,
	SpecialUserStatus,
	TestClient,
} from '../sdk/src';
import { TestBulkAccountLoader } from '../sdk/src/accounts/testBulkAccountLoader';
import { BankrunContextWrapper } from '../sdk/src/bankrun/bankrunConnection';
import {
	initializeQuoteSpotMarket,
	mockOracleNoProgram,
	mockUSDCMint,
	mockUserUSDCAccount,
} from './testHelpers';

describe('special user account', () => {
	const chProgram = anchor.workspace.Drift as Program;

	let driftClient: TestClient;
	let bulkAccountLoader: TestBulkAccountLoader;
	let bankrunContextWrapper: BankrunContextWrapper;
	let usdcMint;
	let userAccountPublicKey: PublicKey;
	let userSubaccount1PublicKey: PublicKey;
	let userUSDCAccount: Keypair;

	const usdcAmount = new BN(20 * 10 ** 6);
	const marketIndex = 0;
	const initialSolPrice = 50;
	const ammInitialQuoteAssetAmount = new BN(2 * 10 ** 9).mul(new BN(10 ** 5));
	const ammInitialBaseAssetAmount = new BN(2 * 10 ** 9).mul(new BN(10 ** 5));
	let solUsdOracle: PublicKey;

	const expectFail = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			assert.fail('Should have thrown');
		} catch (e) {
			const err = e as Error;
			assert(err.message.includes('custom program error'));
		}
	};

	const placePerpMarketOrder = async (
		direction: PositionDirection,
		baseAssetAmount: BN
	) => {
		const orderParams = getMarketOrderParams({
			marketIndex,
			direction,
			baseAssetAmount,
		});
		await driftClient.placeAndTakePerpOrder(orderParams);
	};

	const flattenPosition = async (subAccountId = 0) => {
		const position = driftClient
			.getUser(subAccountId)
			.getPerpPosition(marketIndex).baseAssetAmount;

		if (position.eq(new BN(0))) {
			return;
		}

		await driftClient.switchActiveUser(subAccountId);
		await placePerpMarketOrder(
			position.gt(new BN(0)) ? PositionDirection.SHORT : PositionDirection.LONG,
			position.abs()
		);
	};

	before(async () => {
		const context = await startAnchor('', [], []);

		bankrunContextWrapper = new BankrunContextWrapper(context as any);

		bulkAccountLoader = new TestBulkAccountLoader(
			bankrunContextWrapper.connection,
			'processed',
			1
		);

		usdcMint = await mockUSDCMint(bankrunContextWrapper);
		solUsdOracle = await mockOracleNoProgram(
			bankrunContextWrapper,
			initialSolPrice,
			-10,
			0.0005,
			10000
		);

		driftClient = new TestClient({
			connection: bankrunContextWrapper.connection.toConnection(),
			wallet: bankrunContextWrapper.provider.wallet,
			programID: chProgram.programId,
			opts: {
				commitment: 'confirmed',
			},
			activeSubAccountId: 0,
			perpMarketIndexes: [0],
			spotMarketIndexes: [0],
			subAccountIds: [],
			oracleInfos: [
				{ publicKey: solUsdOracle, source: OracleSource.PYTH_LAZER },
			],
			accountSubscription: {
				type: 'polling',
				accountLoader: bulkAccountLoader,
			},
		});

		await driftClient.initialize(usdcMint.publicKey, true);
		await driftClient.subscribe();

		await initializeQuoteSpotMarket(driftClient, usdcMint.publicKey);
		await driftClient.updatePerpAuctionDuration(0);
		const periodicity = new BN(60 * 60);
		await driftClient.initializePerpMarket(
			marketIndex,
			solUsdOracle,
			ammInitialBaseAssetAmount,
			ammInitialQuoteAssetAmount,
			periodicity,
			new BN(initialSolPrice).mul(PEG_PRECISION)
		);
		await driftClient.updatePerpMarketStatus(marketIndex, MarketStatus.ACTIVE);

		await driftClient.initializeUserAccount();
		userAccountPublicKey = await driftClient.getUserAccountPublicKey();
		await driftClient.initializeUserAccount(1);
		userSubaccount1PublicKey = await driftClient.getUserAccountPublicKey(1);

		userUSDCAccount = await mockUserUSDCAccount(
			usdcMint,
			usdcAmount.muln(2),
			bankrunContextWrapper,
			driftClient.wallet.publicKey
		);
		await driftClient.deposit(
			usdcAmount,
			QUOTE_SPOT_MARKET_INDEX,
			userUSDCAccount.publicKey
		);
		await driftClient.switchActiveUser(1);
		await driftClient.deposit(
			usdcAmount,
			QUOTE_SPOT_MARKET_INDEX,
			userUSDCAccount.publicKey
		);
		await driftClient.switchActiveUser(0);

		await driftClient.fetchAccounts();
	});

	after(async () => {
		await driftClient.unsubscribe();
	});

	it('defaults to no special status', async () => {
		await driftClient.fetchAccounts();
		const userAccount = driftClient.getUserAccount();
		assert(userAccount.specialUserStatus === 0);
	});

	it('sets vamm hedger flag', async () => {
		await driftClient.updateSpecialUserStatus(
			userAccountPublicKey,
			SpecialUserStatus.VAMM_HEDGER
		);
		await driftClient.fetchAccounts();
		const userAccount = driftClient.getUserAccount();
		assert(userAccount.specialUserStatus === SpecialUserStatus.VAMM_HEDGER);
	});

	it('clears special status back to zero', async () => {
		await driftClient.updateSpecialUserStatus(userAccountPublicKey, 0);
		await driftClient.fetchAccounts();
		const userAccount = driftClient.getUserAccount();
		assert(userAccount.specialUserStatus === 0);
	});

	it('rejects unknown status bits', async () => {
		let threw = false;
		try {
			await driftClient.updateSpecialUserStatus(userAccountPublicKey, 0xff);
		} catch (e) {
			threw = true;
		}
		assert(threw, 'should have thrown for invalid special user status bits');
	});

	it('fails transfer when user is not flagged special', async () => {
		await driftClient.updateSpecialUserStatus(userAccountPublicKey, 0);
		await placePerpMarketOrder(PositionDirection.LONG, BASE_PRECISION);
		await driftClient.fetchAccounts();

		const userPositionBeforeTransfer = driftClient
			.getUser()
			.getPerpPosition(marketIndex);

		assert(
			userPositionBeforeTransfer.baseAssetAmount.gt(new BN(0)),
			'user position should exist after placing long order'
		);

		await expectFail(() =>
			driftClient.specialTransferPerpPositionToVamm(
				userAccountPublicKey,
				marketIndex
			)
		);

		await flattenPosition(0);
		await driftClient.fetchAccounts();
	});

	it('fails transfer when position would increase vamm exposure', async () => {
		await driftClient.updateSpecialUserStatus(
			userAccountPublicKey,
			SpecialUserStatus.VAMM_HEDGER
		);
		await placePerpMarketOrder(PositionDirection.LONG, BASE_PRECISION.divn(2));
		await driftClient.fetchAccounts();

		const userSubaccount0PositionBeforeInvalidTransfer = driftClient
			.getUser(0)
			.getPerpPosition(marketIndex);

		assert(
			userSubaccount0PositionBeforeInvalidTransfer.baseAssetAmount.gt(
				new BN(0)
			),
			'subaccount 0 position should exist after placing long order'
		);

		await driftClient.switchActiveUser(1);
		await driftClient.updateSpecialUserStatus(
			userSubaccount1PublicKey,
			SpecialUserStatus.VAMM_HEDGER
		);
		await placePerpMarketOrder(PositionDirection.SHORT, BASE_PRECISION.divn(4));
		await driftClient.fetchAccounts();

		const marketBeforeInvalidTransfer =
			driftClient.getPerpMarketAccount(marketIndex);

		const userSubaccount1PositionBeforeInvalidTransfer = driftClient
			.getUser(1)
			.getPerpPosition(marketIndex);

		assert(
			userSubaccount1PositionBeforeInvalidTransfer.baseAssetAmount.lt(
				new BN(0)
			),
			'subaccount 1 position should exist after placing short order'
		);

		assert(
			marketBeforeInvalidTransfer.amm.baseAssetAmountWithAmm.gt(new BN(0)),
			'expected positive baseAssetAmountWithAmm before invalid transfer'
		);

		await expectFail(() =>
			driftClient.specialTransferPerpPositionToVamm(
				userSubaccount1PublicKey,
				marketIndex
			)
		);

		await driftClient.fetchAccounts();

		const marketAfterInvalidTransfer =
			driftClient.getPerpMarketAccount(marketIndex);
		const userSubaccount1PositionAfterInvalidTransfer = driftClient
			.getUser(1)
			.getPerpPosition(marketIndex);

		assert(
			marketAfterInvalidTransfer.amm.baseAssetAmountWithAmm.eq(
				marketBeforeInvalidTransfer.amm.baseAssetAmountWithAmm
			),
			'baseAssetAmountWithAmm should be unchanged when transfer fails'
		);
		assert(
			userSubaccount1PositionAfterInvalidTransfer.baseAssetAmount.eq(
				userSubaccount1PositionBeforeInvalidTransfer.baseAssetAmount
			),
			'user position should be unchanged when transfer fails'
		);

		await driftClient.switchActiveUser(0);
		await flattenPosition(0);
		await driftClient.switchActiveUser(1);
		await flattenPosition(1);
		await driftClient.switchActiveUser(0);
		await driftClient.fetchAccounts();
	});

	it('transfers 50% of position when amount is provided', async () => {
		await driftClient.updateSpecialUserStatus(
			userAccountPublicKey,
			SpecialUserStatus.VAMM_HEDGER
		);

		await placePerpMarketOrder(PositionDirection.LONG, BASE_PRECISION);
		await driftClient.fetchAccounts();
		const userPositionAfterPlace = driftClient
			.getUser()
			.getPerpPosition(marketIndex);
		assert(
			userPositionAfterPlace.baseAssetAmount.gt(new BN(0)),
			'user position should exist after placing long order'
		);

		const halfPosition = BASE_PRECISION.divn(2);
		const userPositionBeforeTransfer = userPositionAfterPlace;
		const marketBeforeTransfer = driftClient.getPerpMarketAccount(marketIndex);

		await driftClient.specialTransferPerpPositionToVamm(
			userAccountPublicKey,
			marketIndex,
			halfPosition
		);
		await driftClient.fetchAccounts();

		const userPositionAfterTransfer = driftClient
			.getUser()
			.getPerpPosition(marketIndex);
		assert(
			userPositionAfterTransfer.baseAssetAmount.eq(
				userPositionBeforeTransfer.baseAssetAmount.sub(halfPosition)
			),
			'special user position should be reduced by transfer amount'
		);

		const marketAfterTransfer = driftClient.getPerpMarketAccount(marketIndex);
		assert(
			marketAfterTransfer.amm.baseAssetAmountWithAmm.eq(
				marketBeforeTransfer.amm.baseAssetAmountWithAmm.sub(halfPosition)
			),
			'baseAssetAmountWithAmm should be reduced by transfer amount'
		);

		await driftClient.specialTransferPerpPositionToVamm(
			userAccountPublicKey,
			marketIndex
		);
		await driftClient.fetchAccounts();

		const userPositionAfterFullTransfer = driftClient
			.getUser()
			.getPerpPosition(marketIndex);
		assert(
			userPositionAfterFullTransfer.baseAssetAmount.eq(new BN(0)),
			'user should have no remaining perp position after full transfer'
		);
		assert(
			userPositionAfterFullTransfer.openOrders === 0,
			'user perp position should be effectively removed after full transfer'
		);
	});
});
