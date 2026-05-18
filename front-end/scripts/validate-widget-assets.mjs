import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const browserDir = resolve(
  repoRoot,
  'wigtail',
  'mysite',
  'static',
  'angular-taxonomy-chip-widget',
  'browser',
);

const requiredAssets = ['main.js', 'styles.css'];
const missingAssets = requiredAssets.filter((asset) => !existsSync(resolve(browserDir, asset)));

let hashedAssets = [];
try {
  hashedAssets = readdirSync(browserDir).filter((asset) => /^(main|styles)-.+\.(js|css)$/.test(asset));
} catch (error) {
  console.error(`Widget asset directory is missing or unreadable: ${browserDir}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (missingAssets.length || hashedAssets.length) {
  if (missingAssets.length) {
    console.error(`Missing stable widget asset(s): ${missingAssets.join(', ')}`);
  }
  if (hashedAssets.length) {
    console.error(`Unexpected hashed widget asset(s): ${hashedAssets.join(', ')}`);
  }
  console.error('Wagtail templates load browser/main.js and browser/styles.css directly.');
  process.exit(1);
}

console.log('Widget assets OK: main.js and styles.css are present with stable names.');
