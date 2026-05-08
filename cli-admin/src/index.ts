#!/usr/bin/env bun
import { Command } from 'commander';
import { registerCall } from './commands/call';
import { registerCold } from './commands/cold';
import { registerHot } from './commands/hot';
import { registerShow } from './commands/show';
import { registerWarm } from './commands/warm';

const program = new Command();

program
	.name('drift-admin')
	.description(
		[
			'Drift v2 admin CLI — cold/warm/hot tier operations.',
			'',
			'Authority model:',
			'  COLD ⊇ WARM ⊇ HOT(role). Cold is `state.admin` (rare, ceremonial).',
			'  Warm is the multisig+timelock pubkey on AdminAuthorityConfig (day-to-day governance).',
			'  Hot keys are per-role bot signers stored on AdminAuthorityConfig.',
			'',
			'Squads V4 multisig: pass --multisig <pubkey> to wrap any subcommand in a',
			'vault transaction proposal instead of sending directly. Members must then',
			'approve + execute via the Squads UI (or a separate CLI).',
		].join('\n')
	)
	.version('0.1.0')
	.showHelpAfterError()
	.showSuggestionAfterError();

registerShow(program);
registerCold(program);
registerWarm(program);
registerHot(program);
registerCall(program);

program.parseAsync(process.argv).catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
