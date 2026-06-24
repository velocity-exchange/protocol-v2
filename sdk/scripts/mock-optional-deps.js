const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '..', 'node_modules', 'helius-laserstream');

let packageResolvable = false;
try {
	require.resolve('helius-laserstream');
	packageResolvable = true;
} catch (_) {
	// not installed or not resolvable
}

if (!packageResolvable) {
	console.log('helius-laserstream is not installed. Creating a local shim for compilation...');
	try {
		fs.mkdirSync(targetDir, { recursive: true });
	} catch (e) {
		console.error('Failed to create directory for helius-laserstream shim:', e);
		process.exit(1);
	}

	const packageJson = {
		name: 'helius-laserstream',
		version: '0.1.8',
		main: 'index.js',
		types: 'index.d.ts'
	};

	const indexJs = `module.exports = {
	CommitmentLevel: {
		PROCESSED: 0,
		CONFIRMED: 1,
		FINALIZED: 2
	},
	CompressionAlgorithms: {
		identity: 0,
		deflate: 1,
		gzip: 2,
		zstd: 3
	},
	subscribe: () => {
		throw new Error('helius-laserstream is shimmed and not available on this platform.');
	}
};`;

	const indexDts = `export interface LaserstreamConfig {
	apiKey?: string;
	endpoint?: string;
	maxReconnectAttempts?: number;
	channelOptions?: any;
}
export interface SubscribeRequest {
	slots?: any;
	accounts?: any;
	transactions?: any;
	blocks?: any;
	blocksMeta?: any;
	accountsDataSlice?: any;
	commitment?: any;
	entry?: any;
	transactionsStatus?: any;
}
export interface SubscribeUpdate {
	account?: {
		slot: string | number;
		account: {
			pubkey: string;
			owner: string;
			lamports: string | number;
			data: Uint8Array | number[] | string;
			executable: boolean;
			rentEpoch: string | number;
		};
	};
}
export enum CommitmentLevel {
	PROCESSED = 0,
	CONFIRMED = 1,
	FINALIZED = 2
}
export enum CompressionAlgorithms {
	identity = 0,
	deflate = 1,
	gzip = 2,
	zstd = 3
}
export function subscribe(...args: any[]): any;`;

	try {
		fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2));
		fs.writeFileSync(path.join(targetDir, 'index.js'), indexJs);
		fs.writeFileSync(path.join(targetDir, 'index.d.ts'), indexDts);
		console.log('Shim created successfully.');
	} catch (e) {
		console.error('Failed to write files for helius-laserstream shim:', e);
		process.exit(1);
	}
} else {
	console.log('helius-laserstream is already installed.');
}
