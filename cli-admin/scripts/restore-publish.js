#!/usr/bin/env node
// Counterpart to prepare-publish.js. Restores the file:../sdk dep so the
// committed package.json doesn't drift after `npm publish`.

const fs = require('fs');
const path = require('path');

const cliPkgPath = path.join(__dirname, '..', 'package.json');
const backupPath = `${cliPkgPath}.bak`;

if (!fs.existsSync(backupPath)) {
	console.warn('[restore-publish] no backup found, leaving package.json as-is');
	process.exit(0);
}

fs.copyFileSync(backupPath, cliPkgPath);
fs.unlinkSync(backupPath);
console.log('[restore-publish] cli-admin/package.json restored');
