/**
 * Devnet initialization runbook for the drift program.
 *
 * Run AFTER `anchor deploy` has published the drift and token_faucet programs
 * to devnet. Executes phases 0 + A–G from
 * .claude/plans/drift-devnet-deployment.md:
 *
 *   0) create USDT SPL mint + initialize token_faucet for distribution
 *   A) global state + amm cache
 *   B) USDT spot market at index 0
 *   C) Pyth Lazer SOL/USD oracle
 *   D) SOL-PERP at index 0
 *   E) ProtocolIfSharesTransferConfig
 *   F) LP pool + USDT constituent
 *   G) ProtectedMakerModeConfig
 *
 * Idempotent: every phase checks whether its destination PDA already exists on
 * chain and skips if so. Safe to re-run after partial failure. Phase 0 reuses
 * the mint recorded in the receipt on re-runs.
 *
 * Required env:
 *   DEVNET_ADMIN        path to admin keypair file (becomes State.admin — immutable)
 *   SOL_LAZER_FEED_ID   Pyth Lazer u32 feed id for SOL/USD
 * Optional env:
 *   USDT_MINT           existing devnet USDT SPL mint (6 decimals). If unset, a
 *                       fresh mint is created in Phase 0 and persisted to the
 *                       receipt; subsequent runs reuse it.
 *   USDT_MINT_KEYPAIR   path to keypair for the USDT mint (vanity address).
 *                       If unset, a random keypair is generated and saved next
 *                       to the receipt as usdt-mint.json.
 *   USDT_INITIAL_SUPPLY amount (whole tokens) to mint to admin before the
 *                       faucet takes over mint authority. Default 10_000_000.
 *   TOKEN_FAUCET_PROGRAM_ID  defaults to V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB.
 *   RPC_URL             default https://api.devnet.solana.com
 *   LP_POOL_ID          default 1 (id 0 is the sentinel "not in a pool")
 *   LP_MAX_AUM          default 1_000_000 USDT (in QUOTE_PRECISION units)
 *   PROTECTED_MAKER_MAX_USERS  default 200
 *   RECEIPT_PATH        default deploy-scripts/out/devnet-deployment.json
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	SYSVAR_RENT_PUBKEY,
	Transaction,
} from '@solana/web3.js';
import { BN, AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import {
	TOKEN_PROGRAM_ID,
	createMint,
	getAssociatedTokenAddress,
	createAssociatedTokenAccountInstruction,
	createMintToInstruction,
} from '@solana/spl-token';
import tokenFaucetIdl from '../sdk/src/idl/token_faucet.json';
import {
	AdminClient,
	AMM_RESERVE_PRECISION,
	AssetTier,
	BASE_PRECISION,
	ContractTier,
	DRIFT_DEVNET_PROGRAM_ID,
	OracleSource,
	PEG_PRECISION,
	PERCENTAGE_PRECISION,
	PRICE_PRECISION,
	QUOTE_PRECISION,
	SPOT_MARKET_RATE_PRECISION,
	SPOT_MARKET_WEIGHT_PRECISION,
	Wallet,
	ZERO,
	getAmmCachePublicKey,
	getConstituentPublicKey,
	getDriftStateAccountPublicKey,
	getLpPoolPublicKey,
	getPerpMarketPublicKey,
	getProtectedMakerModeConfigPublicKey,
	getProtocolIfSharesTransferConfigPublicKey,
	getPythLazerOraclePublicKey,
	getSpotMarketPublicKey,
	loadKeypair,
} from '../sdk/src';
import type { InitializeConstituentParams } from '../sdk/src/types';

type Receipt = {
	cluster: string;
	programId: string;
	admin: string;
	usdtMint: string;
	usdtMintKeypairPath?: string;
	usdtMintCreateTxSig?: string;
	usdtInitialSupplyTxSig?: string;
	tokenFaucet?: {
		programId: string;
		faucetConfig: string;
		mintAuthority: string;
		initTxSig?: string;
	};
	state?: { pubkey: string; txSig?: string };
	ammCache?: { pubkey: string; txSig?: string };
	spotMarkets: Record<number, { pubkey: string; txSig?: string }>;
	pythLazerOracles: Record<number, { pubkey: string; txSig?: string }>;
	perpMarkets: Record<number, { pubkey: string; txSig?: string }>;
	protocolIfSharesTransferConfig?: { pubkey: string; txSig?: string };
	lpPool?: {
		id: number;
		pubkey: string;
		mint: string;
		txSig?: string;
	};
	constituents: Record<number, { pubkey: string; txSig?: string }>;
	protectedMakerModeConfig?: { pubkey: string; txSig?: string };
	startedAt: string;
	finishedAt?: string;
};

const TOKEN_FAUCET_DEFAULT_PROGRAM_ID =
	'V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB';
const USDT_DECIMALS = 6;

function getFaucetConfigPda(
	programId: PublicKey,
	mint: PublicKey
): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('faucet_config'), mint.toBuffer()],
		programId
	)[0];
}

function getFaucetMintAuthorityPda(
	programId: PublicKey,
	mint: PublicKey
): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('mint_authority'), mint.toBuffer()],
		programId
	)[0];
}

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`missing env ${name}`);
	return v;
}

async function pdaExists(
	connection: Connection,
	pda: PublicKey
): Promise<boolean> {
	const info = await connection.getAccountInfo(pda, 'confirmed');
	return info !== null;
}

function logStep(title: string, note?: string) {
	const ts = new Date().toISOString();
	console.log(`\n[${ts}] ${title}${note ? ` — ${note}` : ''}`);
}

const NON_INTERACTIVE =
	process.env.NON_INTERACTIVE === '1' || process.env.YES === '1';

async function confirm(prompt: string, details?: string[]): Promise<void> {
	if (details && details.length > 0) {
		console.log('');
		for (const line of details) console.log(`  ${line}`);
	}
	if (NON_INTERACTIVE) {
		console.log(`[non-interactive] ${prompt} (auto-yes)`);
		return;
	}
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const answer: string = await new Promise((resolve) => {
		rl.question(`\n${prompt} [y/N] `, (a) => resolve(a.trim().toLowerCase()));
	});
	rl.close();
	if (answer !== 'y' && answer !== 'yes') {
		console.log('aborted by user.');
		process.exit(1);
	}
}

async function assertMint(connection: Connection, mint: PublicKey, label: string) {
	const info = await connection.getAccountInfo(mint, 'confirmed');
	if (!info) throw new Error(`${label} ${mint.toBase58()} not found on cluster`);
	const owner = info.owner.toBase58();
	const tokenProgram = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
	const token2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
	if (owner !== tokenProgram && owner !== token2022) {
		throw new Error(
			`${label} ${mint.toBase58()} is not a token mint (owner=${owner})`
		);
	}
}

function tryLoadExistingReceipt(receiptPath: string): Receipt | null {
	try {
		const raw = fs.readFileSync(receiptPath, 'utf8');
		return JSON.parse(raw) as Receipt;
	} catch {
		return null;
	}
}

async function main() {
	const rpcUrl = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
	const adminPath = requireEnv('DEVNET_ADMIN');
	const solLazerFeedId = Number(requireEnv('SOL_LAZER_FEED_ID'));
	if (!Number.isFinite(solLazerFeedId) || solLazerFeedId < 0) {
		throw new Error('SOL_LAZER_FEED_ID must be a non-negative integer');
	}
	const lpPoolId = Number(process.env.LP_POOL_ID ?? 1);
	const lpMaxAum = new BN(process.env.LP_MAX_AUM ?? '1000000').mul(
		QUOTE_PRECISION
	);
	const protectedMakerMaxUsers = Number(
		process.env.PROTECTED_MAKER_MAX_USERS ?? 200
	);
	const receiptPath =
		process.env.RECEIPT_PATH ?? 'deploy-scripts/out/devnet-deployment.json';
	const absReceiptPath = path.resolve(process.cwd(), receiptPath);
	fs.mkdirSync(path.dirname(absReceiptPath), { recursive: true });

	const connection = new Connection(rpcUrl, 'confirmed');
	const keypair = loadKeypair(adminPath);
	const wallet = new Wallet(keypair);
	const programId = new PublicKey(DRIFT_DEVNET_PROGRAM_ID);
	const tokenFaucetProgramId = new PublicKey(
		process.env.TOKEN_FAUCET_PROGRAM_ID ?? TOKEN_FAUCET_DEFAULT_PROGRAM_ID
	);

	// Resolve the USDT mint up-front: env > prior receipt > will be created in Phase 0.
	const existingReceipt = tryLoadExistingReceipt(absReceiptPath);
	let usdtMint: PublicKey | null = null;
	let usdtMintKeypair: Keypair | null = null;
	const usdtMintKeypairPath =
		process.env.USDT_MINT_KEYPAIR ??
		path.join(path.dirname(absReceiptPath), 'usdt-mint.json');
	if (process.env.USDT_MINT) {
		usdtMint = new PublicKey(process.env.USDT_MINT);
	} else if (existingReceipt?.usdtMint) {
		usdtMint = new PublicKey(existingReceipt.usdtMint);
	} else if (fs.existsSync(usdtMintKeypairPath)) {
		usdtMintKeypair = loadKeypair(usdtMintKeypairPath);
		usdtMint = usdtMintKeypair.publicKey;
	}
	const willCreateUsdt = usdtMint === null;

	console.log(`drift program: ${programId.toBase58()}`);
	console.log(`faucet prog:   ${tokenFaucetProgramId.toBase58()}`);
	console.log(`rpc:           ${rpcUrl}`);
	console.log(`admin:         ${keypair.publicKey.toBase58()}`);
	console.log(
		`usdt mint:     ${usdtMint ? usdtMint.toBase58() : '(will create in Phase 0)'}`
	);
	console.log(`sol lazer fid: ${solLazerFeedId}`);
	console.log(`lp pool id:    ${lpPoolId}`);

	// === Pre-flight: verify program + mint are live, show admin balance ===
	logStep('pre-flight checks');
	const programInfo = await connection.getAccountInfo(programId, 'confirmed');
	if (!programInfo || !programInfo.executable) {
		throw new Error(
			`drift program ${programId.toBase58()} is not deployed/executable on ${rpcUrl}. Run \`anchor deploy\` first.`
		);
	}
	const faucetInfo = await connection.getAccountInfo(
		tokenFaucetProgramId,
		'confirmed'
	);
	if (!faucetInfo || !faucetInfo.executable) {
		throw new Error(
			`token_faucet program ${tokenFaucetProgramId.toBase58()} is not deployed/executable on ${rpcUrl}. Run \`anchor deploy\` for it first.`
		);
	}
	if (usdtMint) await assertMint(connection, usdtMint, 'USDT mint');
	const adminLamports = await connection.getBalance(
		keypair.publicKey,
		'confirmed'
	);
	const adminSol = adminLamports / 1e9;

	const usdtInitialSupplyWhole = new BN(
		process.env.USDT_INITIAL_SUPPLY ?? '10000000'
	);

	await confirm('Proceed with this configuration?', [
		`cluster:        ${rpcUrl}`,
		`drift program:  ${programId.toBase58()} (executable ✓)`,
		`faucet program: ${tokenFaucetProgramId.toBase58()} (executable ✓)`,
		`admin:          ${keypair.publicKey.toBase58()} (${adminSol.toFixed(4)} SOL)`,
		`USDT mint:      ${
			usdtMint ? `${usdtMint.toBase58()}${willCreateUsdt ? ' (to be created)' : ' (token mint ✓)'}` : '(to be created)'
		}`,
		`USDT supply:    ${usdtInitialSupplyWhole.toString()} tokens pre-mint to admin (before faucet takes authority)`,
		`SOL Lazer feed: ${solLazerFeedId}`,
		`LP pool id:     ${lpPoolId}`,
		`LP max AUM:     ${lpMaxAum.toString()} (raw, QUOTE_PRECISION units)`,
		`PMM max users:  ${protectedMakerMaxUsers}`,
		`receipt path:   ${receiptPath}`,
		'',
		'NOTE: State.admin is set IMMUTABLY in Phase A. Verify the admin pubkey above.',
	]);

	const receipt: Receipt = {
		cluster: rpcUrl,
		programId: programId.toBase58(),
		admin: keypair.publicKey.toBase58(),
		usdtMint: usdtMint ? usdtMint.toBase58() : '',
		spotMarkets: {},
		pythLazerOracles: {},
		perpMarkets: {},
		constituents: {},
		startedAt: new Date().toISOString(),
	};

	// === Phase 0: dUSDT SPL mint + token_faucet distribution wiring ===
	// "dUSDT" is the on-chain ticker for the devnet quote token (controlled by us
	// via the token_faucet). Internal identifiers stay `usdt*` for brevity.
	await confirm(
		'Begin Phase 0 — create dUSDT SPL mint + initialize token_faucet?',
		[
			willCreateUsdt
				? `A fresh 6-decimal dUSDT mint will be created; keypair saved to ${usdtMintKeypairPath}`
				: `Using existing mint ${usdtMint!.toBase58()}`,
			`Admin will receive ${usdtInitialSupplyWhole.toString()} dUSDT (pre-faucet), then mint authority is transferred to the token_faucet PDA.`,
			'After Phase 0 anyone can call token_faucet.mint_to_user to receive devnet dUSDT.',
		]
	);

	if (willCreateUsdt) {
		if (!usdtMintKeypair) {
			if (fs.existsSync(usdtMintKeypairPath)) {
				usdtMintKeypair = loadKeypair(usdtMintKeypairPath);
			} else {
				usdtMintKeypair = Keypair.generate();
				fs.writeFileSync(
					usdtMintKeypairPath,
					JSON.stringify(Array.from(usdtMintKeypair.secretKey))
				);
				console.log(`saved USDT mint keypair: ${usdtMintKeypairPath}`);
			}
		}
		const existing = await connection.getAccountInfo(
			usdtMintKeypair.publicKey,
			'confirmed'
		);
		if (existing) {
			logStep(
				'dUSDT mint already on chain',
				usdtMintKeypair.publicKey.toBase58()
			);
		} else {
			logStep('create dUSDT SPL mint (6 decimals)');
			const mintPk = await createMint(
				connection,
				keypair,
				keypair.publicKey, // initial mint authority = admin (needed to pre-mint + initialize faucet)
				null, // no freeze authority
				USDT_DECIMALS,
				usdtMintKeypair
			);
			console.log(`  mint: ${mintPk.toBase58()}`);
		}
		usdtMint = usdtMintKeypair.publicKey;
		receipt.usdtMint = usdtMint.toBase58();
		receipt.usdtMintKeypairPath = usdtMintKeypairPath;
	}

	// Pre-mint initial supply to admin (so admin can seed vaults / test wallets
	// without going through the faucet). Safe to re-run: creates the ATA if
	// needed and mints only when current authority is still the admin.
	{
		const adminAta = await getAssociatedTokenAddress(
			usdtMint!,
			keypair.publicKey
		);
		const ataInfo = await connection.getAccountInfo(adminAta, 'confirmed');
		const mintInfo = await connection.getParsedAccountInfo(
			usdtMint!,
			'confirmed'
		);
		const mintAuthority =
			(mintInfo.value?.data as any)?.parsed?.info?.mintAuthority ?? null;
		const adminIsAuthority =
			mintAuthority === keypair.publicKey.toBase58();
		if (adminIsAuthority && usdtInitialSupplyWhole.gtn(0)) {
			const amount = usdtInitialSupplyWhole.mul(
				new BN(10).pow(new BN(USDT_DECIMALS))
			);
			const tx = new Transaction();
			if (!ataInfo) {
				tx.add(
					createAssociatedTokenAccountInstruction(
						keypair.publicKey,
						adminAta,
						keypair.publicKey,
						usdtMint!
					)
				);
			}
			tx.add(
				createMintToInstruction(
					usdtMint!,
					adminAta,
					keypair.publicKey,
					BigInt(amount.toString())
				)
			);
			logStep(
				`mint ${usdtInitialSupplyWhole.toString()} dUSDT to admin ATA`,
				adminAta.toBase58()
			);
			const sig = await connection.sendTransaction(tx, [keypair]);
			await connection.confirmTransaction(sig, 'confirmed');
			receipt.usdtInitialSupplyTxSig = sig;
		} else {
			logStep(
				'skip admin pre-mint',
				adminIsAuthority
					? 'USDT_INITIAL_SUPPLY is 0'
					: 'admin is no longer mint authority (already transferred to faucet)'
			);
		}
	}

	// Initialize the token_faucet over the USDT mint. This SetAuthorities the
	// mint to the faucet's `mint_authority` PDA so anyone can call mint_to_user.
	{
		const faucetConfigPk = getFaucetConfigPda(tokenFaucetProgramId, usdtMint!);
		const faucetMintAuthorityPk = getFaucetMintAuthorityPda(
			tokenFaucetProgramId,
			usdtMint!
		);
		receipt.tokenFaucet = {
			programId: tokenFaucetProgramId.toBase58(),
			faucetConfig: faucetConfigPk.toBase58(),
			mintAuthority: faucetMintAuthorityPk.toBase58(),
		};
		if (await pdaExists(connection, faucetConfigPk)) {
			logStep(
				'token_faucet already initialized for this mint',
				faucetConfigPk.toBase58()
			);
		} else {
			logStep('token_faucet.initialize (transfers mint authority to faucet PDA)');
			const provider = new AnchorProvider(connection, wallet as any, {
				commitment: 'confirmed',
			});
			// Anchor 1.0 Program(idl, provider). IDL must carry the program address;
			// override the address field on a clone so we honor $TOKEN_FAUCET_PROGRAM_ID.
			const idlWithAddress = {
				...(tokenFaucetIdl as any),
				address: tokenFaucetProgramId.toBase58(),
			} as Idl;
			const faucetProgram = new Program(idlWithAddress, provider);
			const sig = await (faucetProgram.methods as any)
				.initialize()
				.accounts({
					faucetConfig: faucetConfigPk,
					admin: keypair.publicKey,
					mintAccount: usdtMint!,
					rent: SYSVAR_RENT_PUBKEY,
					systemProgram: SystemProgram.programId,
					tokenProgram: TOKEN_PROGRAM_ID,
				})
				.rpc();
			receipt.tokenFaucet.initTxSig = sig;
		}
	}

	// Persist an intermediate receipt before Phase A so the mint/faucet are
	// recorded even if a later phase fails.
	fs.writeFileSync(absReceiptPath, JSON.stringify(receipt, null, 2));

	if (!usdtMint) throw new Error('usdtMint not resolved after Phase 0');
	const quoteMint: PublicKey = usdtMint;

	const client = new AdminClient({
		connection,
		wallet,
		programID: programId,
		env: 'devnet',
		accountSubscription: { type: 'websocket', commitment: 'confirmed' },
		perpMarketIndexes: [],
		spotMarketIndexes: [],
		oracleInfos: [],
		skipLoadUsers: true,
	});

	await confirm('Begin Phase A — global State + AmmCache?', [
		`State PDA will be derived; quote_asset_mint = ${quoteMint.toBase58()}`,
		'AmmCache pre-allocates room for 16 perp markets (required before any perp init).',
	]);
	// === Phase A.1: global State ===
	const statePk = await getDriftStateAccountPublicKey(programId);
	if (await pdaExists(connection, statePk)) {
		logStep('State already initialized', statePk.toBase58());
		receipt.state = { pubkey: statePk.toBase58() };
	} else {
		logStep('initialize (global state)');
		const [txSig] = await client.initialize(quoteMint, false);
		receipt.state = { pubkey: statePk.toBase58(), txSig };
	}

	// subscribe now that State exists; AdminClient method-level code paths
	// expect this.getStateAccount() to be hydrated for subsequent calls.
	await client.subscribe();

	// === Phase A.2: AmmCache ===
	const ammCachePk = getAmmCachePublicKey(programId);
	if (await pdaExists(connection, ammCachePk)) {
		logStep('AmmCache already initialized', ammCachePk.toBase58());
		receipt.ammCache = { pubkey: ammCachePk.toBase58() };
	} else {
		logStep('initializeAmmCache');
		const txSig = await client.initializeAmmCache();
		receipt.ammCache = { pubkey: ammCachePk.toBase58(), txSig };
	}

	await confirm('Begin Phase B — dUSDT spot market at index 0?', [
		`mint = ${quoteMint.toBase58()}`,
		'oracleSource = QUOTE_ASSET, assetTier = COLLATERAL, name = "dUSDT"',
		'Creates spot_market_vault and insurance_fund_vault owned by drift_signer.',
	]);
	// === Phase B: dUSDT spot market at index 0 ===
	const spot0Pk = await getSpotMarketPublicKey(programId, 0);
	if (await pdaExists(connection, spot0Pk)) {
		logStep('Spot market 0 (dUSDT) already initialized', spot0Pk.toBase58());
		receipt.spotMarkets[0] = { pubkey: spot0Pk.toBase58() };
	} else {
		logStep('initializeSpotMarket dUSDT @ index 0');
		const txSig = await client.initializeSpotMarket(
			quoteMint,
			SPOT_MARKET_RATE_PRECISION.divn(2).toNumber(), // optimalUtilization 50%
			SPOT_MARKET_RATE_PRECISION.toNumber(), // optimalRate 100%
			SPOT_MARKET_RATE_PRECISION.toNumber(), // maxRate 100%
			PublicKey.default, // oracle (QUOTE_ASSET source -> default)
			OracleSource.QUOTE_ASSET,
			SPOT_MARKET_WEIGHT_PRECISION.toNumber(), // initialAssetWeight
			SPOT_MARKET_WEIGHT_PRECISION.toNumber(), // maintenanceAssetWeight
			SPOT_MARKET_WEIGHT_PRECISION.toNumber(), // initialLiabilityWeight
			SPOT_MARKET_WEIGHT_PRECISION.toNumber(), // maintenanceLiabilityWeight
			0, // imfFactor
			0, // liquidatorFee
			0, // ifLiquidationFee
			true, // activeStatus
			AssetTier.COLLATERAL,
			ZERO,
			ZERO,
			new BN(1), // orderTickSize
			new BN(1), // orderStepSize
			0, // ifTotalFactor
			'dUSDT',
			0 // marketIndex
		);
		receipt.spotMarkets[0] = { pubkey: spot0Pk.toBase58(), txSig };
		await client.fetchAccounts();
	}

	await confirm('Begin Phase C — Pyth Lazer SOL/USD oracle?', [
		`feed id = ${solLazerFeedId}`,
		'Resulting PythLazerOracle PDA is the oracle for SOL-PERP in the next phase.',
	]);
	// === Phase C: Pyth Lazer SOL/USD oracle ===
	const lazerPk = getPythLazerOraclePublicKey(programId, solLazerFeedId);
	if (await pdaExists(connection, lazerPk)) {
		logStep(
			`Pyth Lazer oracle (feed ${solLazerFeedId}) already initialized`,
			lazerPk.toBase58()
		);
		receipt.pythLazerOracles[solLazerFeedId] = { pubkey: lazerPk.toBase58() };
	} else {
		logStep(`initializePythLazerOracle feed=${solLazerFeedId}`);
		const txSig = await client.initializePythLazerOracle(solLazerFeedId);
		receipt.pythLazerOracles[solLazerFeedId] = {
			pubkey: lazerPk.toBase58(),
			txSig,
		};
	}

	const skipPhaseD = process.env.SKIP_PHASE_D === '1';
	await confirm('Begin Phase D — SOL-PERP at index 0?', [
		`oracle = ${lazerPk.toBase58()} (PythLazerOracle PDA)`,
		'AMM seed reserves = 1000 * AMM_RESERVE_PRECISION (placeholder; tune pre-mainnet).',
		'marginRatioInitial = 20%, marginRatioMaintenance = 5%, contractTier = SPECULATIVE.',
		'lpPoolId = 0 (not in a pool yet).',
		skipPhaseD ? '*** SKIP_PHASE_D=1 set — phase will be SKIPPED ***' : '',
	]);
	// === Phase D: SOL-PERP at index 0 ===
	const perp0Pk = await getPerpMarketPublicKey(programId, 0);
	if (skipPhaseD) {
		logStep(
			'Perp market 0 (SOL-PERP) SKIPPED via SKIP_PHASE_D=1',
			perp0Pk.toBase58()
		);
	} else if (await pdaExists(connection, perp0Pk)) {
		logStep('Perp market 0 (SOL-PERP) already initialized', perp0Pk.toBase58());
		receipt.perpMarkets[0] = { pubkey: perp0Pk.toBase58() };
	} else {
		logStep('initializePerpMarket SOL-PERP @ index 0 (Pyth Lazer)');
		const txSig = await client.initializePerpMarket(
			0,
			lazerPk,
			AMM_RESERVE_PRECISION.muln(1000), // baseAssetReserve — placeholder; tune pre-mainnet
			AMM_RESERVE_PRECISION.muln(1000), // quoteAssetReserve
			new BN(60 * 60), // periodicity: 1 hour
			PEG_PRECISION,
			OracleSource.PYTH_LAZER,
			ContractTier.SPECULATIVE,
			2000, // marginRatioInitial 20%
			500, // marginRatioMaintenance 5%
			0, // liquidatorFee
			10000, // ifLiquidatorFee
			0, // imfFactor
			true, // activeStatus
			0, // baseSpread
			142500, // maxSpread
			ZERO, // maxOpenInterest (0 = unlimited)
			ZERO, // maxRevenueWithdrawPerPeriod
			ZERO, // quoteMaxInsurance
			BASE_PRECISION.divn(10000),
			PRICE_PRECISION.divn(100000),
			BASE_PRECISION.divn(10000),
			undefined, // concentrationCoefScale -> default ONE
			0, // curveUpdateIntensity
			0, // ammJitIntensity
			'SOL-PERP',
			0 // lpPoolId (not in a pool)
		);
		receipt.perpMarkets[0] = { pubkey: perp0Pk.toBase58(), txSig };
		await client.fetchAccounts();
	}

	const skipPhaseE = process.env.SKIP_PHASE_E === '1';
	await confirm('Begin Phase E — ProtocolIfSharesTransferConfig?', [
		'Global one-time PDA that gates IF share transfers.',
		skipPhaseE ? '*** SKIP_PHASE_E=1 set — phase will be SKIPPED ***' : '',
	]);
	// === Phase E: ProtocolIfSharesTransferConfig ===
	const ifCfgPk = getProtocolIfSharesTransferConfigPublicKey(programId);
	if (skipPhaseE) {
		logStep(
			'ProtocolIfSharesTransferConfig SKIPPED via SKIP_PHASE_E=1',
			ifCfgPk.toBase58()
		);
	} else if (await pdaExists(connection, ifCfgPk)) {
		logStep(
			'ProtocolIfSharesTransferConfig already initialized',
			ifCfgPk.toBase58()
		);
		receipt.protocolIfSharesTransferConfig = { pubkey: ifCfgPk.toBase58() };
	} else {
		logStep('initializeProtocolIfSharesTransferConfig');
		const txSig = await client.initializeProtocolIfSharesTransferConfig();
		receipt.protocolIfSharesTransferConfig = {
			pubkey: ifCfgPk.toBase58(),
			txSig,
		};
	}

	await confirm('Begin Phase F — LP pool + USDT constituent?', [
		`lpPoolId = ${lpPoolId}`,
		`maxAum = ${lpMaxAum.toString()} (raw, QUOTE_PRECISION units)`,
		'A fresh 6-decimal LP token mint is generated; authority = LP pool PDA.',
		'USDT (spot index 0) is added as the first constituent.',
	]);
	// === Phase F.1: LpPool ===
	const lpPoolPk = getLpPoolPublicKey(programId, lpPoolId);
	let lpMintPk: PublicKey | null = null;
	if (await pdaExists(connection, lpPoolPk)) {
		logStep(`LpPool ${lpPoolId} already initialized`, lpPoolPk.toBase58());
		// recover the mint pubkey from the on-chain account so the receipt stays
		// correct on re-runs.
		try {
			const acct = await (client.program.account as any).lpPool.fetch(lpPoolPk);
			lpMintPk = acct.mint as PublicKey;
		} catch (_) {
			/* leave null if fetch fails */
		}
		receipt.lpPool = {
			id: lpPoolId,
			pubkey: lpPoolPk.toBase58(),
			mint: lpMintPk ? lpMintPk.toBase58() : '',
		};
	} else {
		const mintKp = Keypair.generate();
		lpMintPk = mintKp.publicKey;
		logStep(
			`initializeLpPool id=${lpPoolId}`,
			`lp mint=${mintKp.publicKey.toBase58()}`
		);
		const txSig = await client.initializeLpPool(
			lpPoolId,
			ZERO, // minMintFee
			lpMaxAum, // maxAum (QUOTE_PRECISION units)
			ZERO, // maxSettleQuoteAmountPerMarket (0 = no per-market cap)
			mintKp
		);
		receipt.lpPool = {
			id: lpPoolId,
			pubkey: lpPoolPk.toBase58(),
			mint: mintKp.publicKey.toBase58(),
			txSig,
		};
	}

	// === Phase F.2: dUSDT constituent (spot index 0) ===
	const constituent0Pk = getConstituentPublicKey(programId, lpPoolPk, 0);
	if (await pdaExists(connection, constituent0Pk)) {
		logStep(
			`Constituent (pool=${lpPoolId}, spot=0) already initialized`,
			constituent0Pk.toBase58()
		);
		receipt.constituents[0] = { pubkey: constituent0Pk.toBase58() };
	} else {
		// initializeConstituent reads spot market 0 from the websocket cache;
		// the initial subscribe used spotMarketIndexes=[] (markets didn't exist
		// yet) and the subscriber map is built at construction. Spin up a
		// fresh AdminClient with [0] for this call only.
		await client.unsubscribe();
		const constituentClient = new AdminClient({
			connection,
			wallet,
			programID: programId,
			env: 'devnet',
			accountSubscription: { type: 'websocket', commitment: 'confirmed' },
			perpMarketIndexes: [],
			spotMarketIndexes: [0],
			oracleInfos: [],
			skipLoadUsers: true,
		});
		await constituentClient.subscribe();
		logStep(`initializeConstituent pool=${lpPoolId} spot=0 (dUSDT)`);
		// param shape mirrors tests/lpPool.ts:392-404 (first constituent = USDT quote).
		const params: InitializeConstituentParams = {
			spotMarketIndex: 0,
			decimals: 6,
			maxWeightDeviation: new BN(10).mul(PERCENTAGE_PRECISION),
			swapFeeMin: new BN(1).mul(PERCENTAGE_PRECISION),
			swapFeeMax: new BN(2).mul(PERCENTAGE_PRECISION),
			maxBorrowTokenAmount: new BN(1_000_000).muln(10 ** 6),
			oracleStalenessThreshold: new BN(400),
			costToTrade: 1,
			derivativeWeight: ZERO,
			volatility: ZERO,
			constituentCorrelations: [], // no prior constituents to correlate against
		};
		const txSig = await constituentClient.initializeConstituent(
			lpPoolId,
			params
		);
		receipt.constituents[0] = { pubkey: constituent0Pk.toBase58(), txSig };
		await constituentClient.unsubscribe();
		await client.subscribe();
	}

	await confirm('Begin Phase G — ProtectedMakerModeConfig?', [
		`maxUsers = ${protectedMakerMaxUsers}`,
	]);
	// === Phase G: ProtectedMakerModeConfig ===
	const pmCfgPk = getProtectedMakerModeConfigPublicKey(programId);
	if (await pdaExists(connection, pmCfgPk)) {
		logStep(
			'ProtectedMakerModeConfig already initialized',
			pmCfgPk.toBase58()
		);
		receipt.protectedMakerModeConfig = { pubkey: pmCfgPk.toBase58() };
	} else {
		logStep(
			`initializeProtectedMakerModeConfig maxUsers=${protectedMakerMaxUsers}`
		);
		const txSig = await client.initializeProtectedMakerModeConfig(
			protectedMakerMaxUsers
		);
		receipt.protectedMakerModeConfig = { pubkey: pmCfgPk.toBase58(), txSig };
	}

	// === Persist receipt ===
	receipt.finishedAt = new Date().toISOString();
	fs.writeFileSync(absReceiptPath, JSON.stringify(receipt, null, 2));
	console.log(`\nreceipt written: ${absReceiptPath}`);

	await client.unsubscribe();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
