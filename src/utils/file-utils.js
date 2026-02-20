import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

const INVALID_CHARS_RE = /[<>:"|?*\x00-\x1f]/;

/** Windows reserved device names — O(1) lookup via Set. */
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// ═══════════════════════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Write a single file, creating parent directories as needed.
 *
 * Extracted from 4 near-identical public functions:
 *   createGitignore, createReadme, createChangelog, and createProjectFiles.
 *
 * @param {string}        fullPath  Absolute file path
 * @param {string|object} content   String written as-is; objects JSON-stringified
 */
async function writeFile(fullPath, content) {
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const text = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
  await fs.writeFile(fullPath, text, 'utf-8');
}

/**
 * Write a named file into a project directory.
 * Logs success/failure and returns a boolean.
 *
 * Replaces `createGitignore`, `createReadme`, `createChangelog`
 * which were copy-paste variants differing only in the filename.
 */
async function writeProjectFile(projectPath, fileName, content) {
  try {
    await writeFile(path.join(projectPath, fileName), content);
    console.log(chalk.green(`✓ Created ${fileName}`));
    return true;
  } catch (err) {
    console.error(chalk.red(`Failed to create ${fileName}:`), err.message);
    return false;
  }
}

/**
 * Run a spinner-wrapped async task.
 * Reduces the repeated start/succeed/fail/console.error pattern.
 */
async function withSpinner(label, fn) {
  const spinner = ora(label).start();
  try {
    await fn();
    spinner.succeed();
    return true;
  } catch (err) {
    spinner.fail();
    console.error(chalk.red(err.message));
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Git Operations
// ═══════════════════════════════════════════════════════════════════════

/** Initialize a Git repository in the given directory. */
export function initGitRepo(projectPath) {
  return withSpinner('Initializing Git repository…', () =>
    execa('git', ['init'], { cwd: projectPath }),
  );
}

/** Stage all files and create an initial commit. */
export function createInitialCommit(projectPath, message) {
  return withSpinner('Creating initial commit…', async () => {
    await execa('git', ['add', '.'], { cwd: projectPath });
    await execa('git', ['commit', '-m', message], { cwd: projectPath });
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Single-File Writers
// ═══════════════════════════════════════════════════════════════════════

/** Create a `.gitignore` in the project root. */
export function createGitignore(projectPath, content) {
  return writeProjectFile(projectPath, '.gitignore', content);
}

/** Create a `README.md` in the project root. */
export function createReadme(projectPath, content) {
  return writeProjectFile(projectPath, 'README.md', content);
}

/** Create a `CHANGELOG.md` in the project root. */
export function createChangelog(projectPath, content) {
  return writeProjectFile(projectPath, 'CHANGELOG.md', content);
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Bulk Directory & File Creation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create multiple directories inside a project.
 *
 * ⚡ All directories created in **parallel** (independent `mkdir -p` calls).
 */
export function createProjectFolders(projectPath, folders) {
  return withSpinner('Creating project structure…', () =>
    Promise.all(
      folders.map(f => fs.mkdir(path.join(projectPath, f), { recursive: true })),
    ),
  );
}

/**
 * Create multiple files inside a project.
 *
 * ⚡ All files written in **parallel** — each call ensures its own
 *    parent directory, so order doesn't matter.
 *
 * @param {Record<string, string | object>} files  Map of relative path → content
 */
export async function createProjectFiles(projectPath, files) {
  const entries = Object.entries(files);

  try {
    await Promise.all(
      entries.map(([rel, content]) => writeFile(path.join(projectPath, rel), content)),
    );
    console.log(chalk.green(`✓ Created ${entries.length} file(s)`));
    return true;
  } catch (err) {
    console.error(chalk.red('Failed to create project files:'), err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Directory Utilities
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a directory is empty (or doesn't exist).
 */
export async function isDirectoryEmpty(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    // Doesn't exist → treat as empty
    return true;
  }
}

/**
 * Create a directory (and parents) if it doesn't already exist.
 */
export async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (err) {
    console.error(chalk.red('Failed to create directory:'), err.message);
    return false;
  }
}

/**
 * Validate a directory name for cross-platform safety.
 * @returns {true | string}  `true` if valid, or an error message string.
 */
export function validateDirectoryName(name) {
  if (!name || name.length === 0) return 'Directory name cannot be empty';
  if (name.length > 255) return 'Directory name is too long';
  if (INVALID_CHARS_RE.test(name)) return 'Directory name contains invalid characters';
  if (RESERVED_NAMES.has(name.toUpperCase())) return 'Directory name is reserved';
  if (name.endsWith(' ') || name.endsWith('.')) {
    return 'Directory name cannot end with a space or period';
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — package.json Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read and parse a project's `package.json`.
 * @returns {Promise<object | null>}
 */
export async function readPackageJson(projectPath) {
  try {
    const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write an object to a project's `package.json`.
 */
export async function writePackageJson(projectPath, content) {
  try {
    await fs.writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify(content, null, 2),
      'utf-8',
    );
    return true;
  } catch (err) {
    console.error(chalk.red('Failed to write package.json:'), err.message);
    return false;
  }
}

/**
 * Merge additional scripts into an existing `package.json`.
 *
 * Reuses `readPackageJson` / `writePackageJson` instead of duplicating
 * the read-parse-write cycle inline.
 */
export async function updatePackageJsonScripts(projectPath, scripts) {
  const pkg = await readPackageJson(projectPath);

  if (!pkg) {
    console.error(chalk.red('Failed to read package.json'));
    return false;
  }

  pkg.scripts = { ...pkg.scripts, ...scripts };

  const ok = await writePackageJson(projectPath, pkg);
  if (ok) console.log(chalk.green('✓ Updated package.json scripts'));
  return ok;
}