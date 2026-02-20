import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import { platform } from 'os';
import { printKeyValue, printObjectList } from './table-helper.js';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

const CURRENT_PLATFORM = platform();

// ═══════════════════════════════════════════════════════════════════════
//  Internal: npm Execution with Retry
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run an npm command. If it fails due to peer-dependency conflicts,
 * automatically retry with `--legacy-peer-deps`.
 *
 * This eliminates the duplicated try/retry/catch pattern that was
 * copy-pasted across `installPackages` and `runNpmInstall`.
 *
 * @param {object}  opts
 * @param {string[]} opts.args       npm arguments (e.g. ['install', '--save-dev', 'pkg'])
 * @param {string}   opts.cwd        Working directory
 * @param {object}   opts.spinner    ora spinner instance (mutated in-place for status)
 * @param {string}   opts.successMsg Message shown on success
 * @param {string}   opts.failMsg    Message shown on final failure
 * @param {string[]} opts.manualHint Lines printed as a manual-recovery tip on failure
 * @returns {Promise<boolean>}
 */
async function npmExecWithRetry({ args, cwd, spinner, successMsg, failMsg, manualHint = [] }) {
  // ── First attempt ───────────────────────────────────────────
  try {
    await execa('npm', args, { cwd });
    spinner.succeed(successMsg);
    return true;
  } catch {
    // fall through to retry
  }

  // ── Retry with --legacy-peer-deps ───────────────────────────
  spinner.warn('Peer dependency conflict — retrying with --legacy-peer-deps…');

  try {
    await execa('npm', [...args, '--legacy-peer-deps'], { cwd });
    spinner.succeed(`${successMsg} (with --legacy-peer-deps)`);
    console.log(chalk.yellow(
      '⚠️  Note: Installed with --legacy-peer-deps due to peer dependency conflicts',
    ));
    return true;
  } catch (error) {
    spinner.fail(failMsg);
    console.error(chalk.red(error.message));

    if (manualHint.length > 0) {
      console.log(chalk.yellow('\n💡 Tip: You can try installing manually with:'));
      for (const line of manualHint) {
        console.log(chalk.cyan(`   ${line}`));
      }
    }
    return false;
  }
}

/**
 * Build the npm-install argument list.
 *
 * Extracted to keep `installPackages` and `runNpmInstall` focused on
 * orchestration rather than array manipulation.
 */
function buildInstallArgs(packages = [], { dev = false } = {}) {
  const args = ['install'];
  if (dev) args.push('--save-dev');
  if (packages.length > 0) args.push(...packages);
  return args;
}

// ═══════════════════════════════════════════════════════════════════════
//  Internal: Spinner-safe Child Process Execution
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run a command that needs to print to the terminal (`stdio: 'inherit'`).
 *
 * Stops the spinner before the subprocess takes over stdout, then
 * restores status afterward. Fixes the visual conflict where ora and
 * `stdio: 'inherit'` would clobber each other.
 */
async function execInteractive(cmd, args, { spinner, successMsg, failMsg }) {
  spinner.stop();                         // clear the spinner line

  try {
    await execa(cmd, args, { stdio: 'inherit' });
    // Re-create a succeeded spinner (ora can't restart after stop)
    ora().succeed(successMsg);
    return true;
  } catch (error) {
    ora().fail(failMsg);
    console.error(chalk.red(error.message));
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Node.js Installation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Install Node.js via winget (Windows only).
 */
export async function installNodeWithWinget(version = 'LTS') {
  const packageId = version === 'LTS' ? 'OpenJS.NodeJS.LTS' : 'OpenJS.NodeJS';
  const spinner = ora('Installing Node.js with winget…').start();

  return execInteractive('winget', ['install', packageId], {
    spinner,
    successMsg: 'Node.js installed successfully',
    failMsg: 'Failed to install Node.js',
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — NVM Guide
// ═══════════════════════════════════════════════════════════════════════

/** Platform-specific nvm installation metadata. */
const NVM_INSTRUCTIONS = {
  win32: {
    os: 'Windows',
    download: 'https://github.com/coreybutler/nvm-windows/releases',
    steps: [
      'Download nvm-setup.exe',
      'Run the installer',
      'Restart your terminal',
    ],
  },
  darwin: {
    os: 'macOS',
    repo: 'https://github.com/nvm-sh/nvm',
    install: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',
    postInstall: [
      'Restart terminal',
      'If using zsh: source ~/.zshrc',
      'If using bash: source ~/.bash_profile',
    ],
    steps: [
      'Run the install command',
      'Reload your shell configuration',
      'Verify: nvm --version',
      'Install Node: nvm install node',
    ],
  },
  linux: {
    os: 'Linux',
    repo: 'https://github.com/nvm-sh/nvm',
    install: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',
    alternative: 'wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',
    steps: [
      'Run install command',
      'Restart terminal or run: source ~/.bashrc',
      'Verify: nvm --version',
      'Install Node: nvm install node',
    ],
  },
};

/**
 * Get nvm installation instructions for the current OS.
 */
export function getNvmInstallInstructions() {
  return NVM_INSTRUCTIONS[CURRENT_PLATFORM] ?? NVM_INSTRUCTIONS.linux;
}

/**
 * Display a formatted nvm installation guide.
 */
export function displayNvmInstallGuide() {
  const data = getNvmInstallInstructions();

  printKeyValue('📚 NVM Installation Guide', [
    ['OS', chalk.cyan(data.os)],
    ['Download/Repo', chalk.blue(data.download ?? data.repo ?? '-')],
    ['Install', data.install ? chalk.green(data.install) : '-'],
    ['Alternative', data.alternative ? chalk.green(data.alternative) : '-'],
  ]);

  const toRows = (arr) => arr.map((s, i) => ({ Step: `${i + 1}`, Instruction: s }));

  if (data.steps) printObjectList('Steps', toRows(data.steps), ['Step', 'Instruction']);
  if (data.postInstall) printObjectList('Post-Install', toRows(data.postInstall), ['Step', 'Instruction']);

  printObjectList('Why use NVM?', [
    { Benefit: 'Manage multiple Node.js versions' },
    { Benefit: 'Switch instantly' },
    { Benefit: 'No sudo/admin required' },
    { Benefit: 'Per-project Node versions' },
  ], ['Benefit']);
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Package Installation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Install an npm package globally.
 */
export async function installGlobalPackage(packageName, version = 'latest') {
  const spec = version === 'latest' ? packageName : `${packageName}@${version}`;
  const spinner = ora(`Installing ${spec} globally…`).start();

  return execInteractive('npm', ['install', '-g', spec], {
    spinner,
    successMsg: `${packageName} installed successfully`,
    failMsg: `Failed to install ${packageName}`,
  });
}

/**
 * Install the Angular CLI globally.
 * Convenience wrapper around {@link installGlobalPackage}.
 */
export function installAngularCli(version = 'latest') {
  return installGlobalPackage('@angular/cli', version);
}

/**
 * Install npm packages into a project directory.
 *
 * Automatically retries with `--legacy-peer-deps` on peer-dep conflicts.
 */
export function installPackages(packages, projectPath, dev = false) {
  const label = `${packages.length} ${dev ? 'dev ' : ''}package(s)`;
  const spinner = ora(`Installing ${label}…`).start();

  return npmExecWithRetry({
    args: buildInstallArgs(packages, { dev }),
    cwd: projectPath,
    spinner,
    successMsg: `${label} installed successfully`,
    failMsg: `Failed to install ${label}`,
    manualHint: [
      `cd ${projectPath}`,
      `npm install ${packages.join(' ')}${dev ? ' --save-dev' : ''} --force`,
    ],
  });
}

/**
 * Run `npm install` in a project directory (no specific packages).
 *
 * Automatically retries with `--legacy-peer-deps` on peer-dep conflicts.
 */
export function runNpmInstall(projectPath) {
  const spinner = ora('Installing dependencies…').start();

  return npmExecWithRetry({
    args: ['install'],
    cwd: projectPath,
    spinner,
    successMsg: 'Dependencies installed successfully',
    failMsg: 'Failed to install dependencies',
    manualHint: [
      `cd ${projectPath}`,
      'npm install --force',
    ],
  });
}

/**
 * Initialize a new npm project (`npm init -y`).
 */
export async function initNpmProject(projectPath) {
  try {
    await execa('npm', ['init', '-y'], { cwd: projectPath, stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(chalk.red('Failed to initialize npm project:', error.message));
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Angular Project Creation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the `ng new` argument list from an options object.
 *
 * Extracted for testability and readability — maps boolean/string
 * options to CLI flags without if/push spaghetti.
 */
function buildNgNewArgs(projectName, options = {}) {
  const args = ['new', projectName];

  /** Map of option key → CLI flag format. */
  const flags = {
    skipInstall: '--skip-install',
    routing: '--routing',
    style: '--style',
    strict: '--strict',
    standalone: '--standalone',
  };

  for (const [key, flag] of Object.entries(flags)) {
    const value = options[key];
    if (value === undefined) continue;

    // Boolean flags: --flag=true / --flag=false
    // String flags:  --flag=value
    if (value === true && flag === '--skip-install') {
      args.push(flag);
    } else if (value !== undefined) {
      args.push(`${flag}=${value}`);
    }
  }

  return args;
}

/**
 * Create a new Angular project using `npx @angular/cli@<version> new`.
 *
 * Uses `stdio: 'inherit'` so the user sees the Angular CLI output in
 * real time. The spinner is stopped before the subprocess starts to
 * prevent visual conflicts.
 */
export async function createAngularProject(projectName, angularVersion, options = {}) {
  const cliPackage = angularVersion
    ? `@angular/cli@${angularVersion}`
    : '@angular/cli';

  const ngArgs = buildNgNewArgs(projectName, options);
  const spinner = ora(`Creating Angular project: ${projectName}…`).start();

  return execInteractive('npx', [cliPackage, ...ngArgs], {
    spinner,
    successMsg: `Angular project ${projectName} created successfully`,
    failMsg: 'Failed to create Angular project',
  });
}