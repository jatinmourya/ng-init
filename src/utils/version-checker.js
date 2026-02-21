import { execa } from 'execa';
import semver from 'semver';
import { printObjectList } from './table-helper.js';

// ═══════════════════════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Semver pattern: extracts the first `x.y.z` from any string. */
const SEMVER_RE = /(\d+\.\d+\.\d+)/;

/**
 * Run a command and return its trimmed stdout.
 * Returns `null` on any failure — callers never need try/catch.
 *
 * @param {string}   cmd
 * @param {string[]} args
 * @param {object}   [opts]  Extra execa options (e.g. `{ shell: true }`)
 * @returns {Promise<string | null>}
 */
async function run(cmd, args, opts) {
  try {
    const { stdout } = await execa(cmd, args, opts);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Run a command and extract the first semver match from stdout.
 * @returns {Promise<string | null>}
 */
async function runVersion(cmd, args, opts) {
  const raw = await run(cmd, args, opts);
  if (!raw) return null;
  const match = raw.match(SEMVER_RE);
  return match ? match[1] : null;
}

/**
 * Parse lines of nvm output and extract every semver string found.
 * Shared between `getInstalledNodeVersions` and `getAvailableNodeVersions`.
 */
function extractVersionsFromOutput(output) {
  if (!output) return [];

  const versions = [];
  for (const line of output.split('\n')) {
    const match = line.match(SEMVER_RE);
    if (match) versions.push(match[1]);
  }
  return versions;
}

// ═══════════════════════════════════════════════════════════════════════
//  nvm shell option — reused by every nvm call
// ═══════════════════════════════════════════════════════════════════════

const NVM_OPTS = { shell: true };

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Individual Version Queries
// ═══════════════════════════════════════════════════════════════════════

/** Current Node.js version (e.g. `"20.11.1"`). */
export function getNodeVersion() {
  return runVersion('node', ['--version']);
}

/** Current npm version (e.g. `"10.2.4"`). */
export function getNpmVersion() {
  return runVersion('npm', ['--version']);
}

/** Current nvm version (e.g. `"1.1.12"`), or `null` if not installed. */
export function getNvmVersion() {
  return runVersion('nvm', ['--version'], NVM_OPTS);
}

/** Whether nvm is available on the current system. */
export async function isNvmInstalled() {
  return (await getNvmVersion()) !== null;
}

/**
 * Current Angular CLI version (e.g. `"17.3.4"`), or `null`.
 *
 * Uses `ng version` which prints a multi-line banner; we extract the
 * first semver found anywhere in the output.
 */
export function getAngularCliVersion() {
  return runVersion('ng', ['version'], NVM_OPTS);
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — System Overview
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect all relevant tool versions and display a summary table.
 *
 * ⚡ All four version checks run **in parallel** — saves ~1–3 s on
 *    cold shells where each `execa` spawn costs 200–400 ms.
 *
 * @returns {{ node, npm, nvm, angularCli }} Version strings or `null`.
 */
export async function displaySystemVersions() {
  const [node, npm, nvm, angularCli] = await Promise.all([
    getNodeVersion(),
    getNpmVersion(),
    getNvmVersion(),
    getAngularCliVersion(),
  ]);

  const format = (v) => v ?? 'Not installed';

  printObjectList('🔍 System Environment Check', [
    { Tool: 'Node.js', Version: format(node) },
    { Tool: 'npm', Version: format(npm) },
    { Tool: 'nvm', Version: format(nvm) },
    { Tool: 'Angular CLI', Version: format(angularCli) },
  ], ['Tool', 'Version']);

  return { node, npm, nvm, angularCli };
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — nvm Version Management
// ═══════════════════════════════════════════════════════════════════════

/**
 * List Node.js versions available for download via nvm.
 * @returns {Promise<string[]>} Semver strings, order as reported by nvm.
 */
export async function getAvailableNodeVersions() {
  const output = await run('nvm', ['list', 'available'], NVM_OPTS);
  return extractVersionsFromOutput(output);
}

/**
 * List locally installed Node.js versions managed by nvm.
 * @returns {Promise<string[]>} Semver strings, order as reported by nvm.
 */
export async function getInstalledNodeVersions() {
  const output = await run('nvm', ['list'], NVM_OPTS);
  return extractVersionsFromOutput(output);
}

/**
 * Switch the active Node.js version via `nvm use`.
 * @returns {Promise<boolean>} Whether the switch succeeded.
 */
export async function switchNodeVersion(version) {
  try {
    await execa('nvm', ['use', version], { ...NVM_OPTS, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a Node.js version via `nvm install`.
 * @returns {Promise<boolean>} Whether the installation succeeded.
 */
export async function installNodeVersion(version) {
  try {
    await execa('nvm', ['install', version], { ...NVM_OPTS, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Semver Utilities
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compare two semantic versions.
 * @returns {-1 | 0 | 1}
 */
// (Removed unused helpers `compareVersions` and `satisfiesVersion`)