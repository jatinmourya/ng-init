import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import {
  displaySystemVersions, getNodeVersion, isNvmInstalled,
  switchNodeVersion, installNodeVersion, getInstalledNodeVersions,
} from './utils/version-checker.js';
import { getAngularVersions, getNodeRequirementsForAngular } from './utils/npm-search.js';
import {
  checkNodeCompatibility, displayCompatibilityStatus,
  findCompatibleVersions, getRecommendedNodeVersion,
  resolveLibraryVersionsAsync,
} from './utils/compatibility.js';
import {
  createAngularProject, installPackages, runNpmInstall,
  installNodeWithWinget, displayNvmInstallGuide,
} from './utils/installer.js';
import {
  interactiveLibrarySearch, simpleLibraryInput,
  askLibrarySearchPreference, selectVersionInteractively,
} from './utils/prompt-handler.js';
import { validateDirectoryName } from './utils/file-utils.js';
import { saveProfile, loadProfile, listProfiles, displayProfileInfo } from './utils/profile-manager.js';
import { printKeyValue, printObjectList } from './utils/table-helper.js';

// ═══════════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, '../package.json'), 'utf-8'),
);

// ═══════════════════════════════════════════════════════════════════════
//  Main CLI Flow
// ═══════════════════════════════════════════════════════════════════════

export async function runCli() {
  try {
    // ── Welcome Banner ──────────────────────────────────────
    displayBanner();

    // ── Step 1: System info ─────────────────────────────────
    await displaySystemVersions();

    // 🚀 Prefetch Angular versions in background while user interacts with profile prompt
    const angularVersionsPromise = getAngularVersions();

    // ── Step 2: Profile selection ───────────────────────────
    let config = {};

    if (await confirm({ message: 'Would you like to use a saved profile?', default: false })) {
      config = await handleProfileSelection();
    }

    // ── Step 3: Angular version ─────────────────────────────
    if (!config.angularVersion) {
      console.log(chalk.bold.cyan('\n📦 Fetching Angular versions…\n'));

      const angularVersions = await angularVersionsPromise;   // ← already in-flight

      if (angularVersions.versions.length === 0) {
        console.log(chalk.red('Failed to fetch Angular versions. Check your internet connection.'));
        process.exit(1);
      }

      const selected = await selectVersionInteractively('Angular', angularVersions);
      if (!selected) { console.log(chalk.red('No version selected.')); process.exit(1); }

      config.angularVersion = selected;
    }

    console.log(chalk.green(`\n✓ Selected Angular version: ${config.angularVersion}\n`));

    // ── Step 4: Node.js compatibility (parallel fetch) ──────
    const [nodeRequirement, currentNodeVersion] = await Promise.all([
      getNodeRequirementsForAngular(config.angularVersion),
      getNodeVersion(),
    ]);

    const compatibility = checkNodeCompatibility(currentNodeVersion, nodeRequirement);
    displayCompatibilityStatus(compatibility);

    // ── Step 5: Handle incompatibility ──────────────────────
    if (!compatibility.compatible) {
      await handleNodeIncompatibility(nodeRequirement);
    }

    // ── Step 6: Project name ────────────────────────────────
    if (!config.projectName) {
      config.projectName = await input({
        message: 'Enter project name:',
        validate: value => {
          if (!value) return 'Project name is required';
          const result = validateDirectoryName(value);
          return result === true ? true : result;
        },
      });
    }

    // ── Step 7: Project location ────────────────────────────
    if (!config.location) {
      const choice = await select({
        message: 'Where would you like to create the project?',
        choices: [
          { name: 'Current directory', value: 'current' },
          { name: 'Specify custom directory', value: 'custom' },
        ],
      });

      config.location = choice === 'custom'
        ? await input({ message: 'Enter directory path:', default: process.cwd() })
        : process.cwd();
    }

    const projectPath = path.join(config.location, config.projectName);

    // ── Step 8: Project options ─────────────────────────────
    if (!config.options) {
      config.options = await promptProjectOptions();
    }

    // ── Step 9: Library selection ───────────────────────────
    if (!config.libraries) {
      const method = await askLibrarySearchPreference();
      config.libraries =
        method === 'interactive' ? await interactiveLibrarySearch(config.angularVersion) :
          method === 'manual' ? await simpleLibraryInput(config.angularVersion) :
            [];
    }

    config.features = [];

    // ── Step 10: Save profile ───────────────────────────────
    if (await confirm({ message: 'Save this configuration as a profile?', default: false })) {
      const name = await input({
        message: 'Enter profile name:',
        validate: v => (v ? true : 'Profile name is required'),
      });
      await saveProfile(name, config);
    }

    // ── Step 11: Summary & confirm ──────────────────────────
    printKeyValue('📋 Project Configuration Summary', [
      ['Project Name', chalk.green(config.projectName)],
      ['Location', chalk.cyan(projectPath)],
      ['Angular Version', chalk.green(config.angularVersion)],
      ['Style', chalk.cyan(config.options.style)],
      ['Routing', chalk.cyan(config.options.routing ? 'Yes' : 'No')],
      ['Strict Mode', chalk.cyan(config.options.strict ? 'Yes' : 'No')],
      ['Standalone', chalk.cyan(config.options.standalone ? 'Yes' : 'No')],
      ['Libraries', chalk.cyan(String(config.libraries.length))],
    ]);

    if (!await confirm({ message: 'Create project with this configuration?', default: true })) {
      console.log(chalk.yellow('Project creation cancelled.\n'));
      process.exit(0);
    }

    // ── Step 12: Create project + resolve libraries (parallel) ──
    console.log(chalk.bold.cyan('\n🚀 Creating Angular project…\n'));

    const [created, resolvedLibraries] = await Promise.all([
      createAngularProject(
        config.projectName,
        config.angularVersion,
        { ...config.options, skipInstall: true },
      ),
      config.libraries.length > 0
        ? resolveLibraryVersionsAsync(config.libraries, config.angularVersion)
        : Promise.resolve([]),
    ]);

    if (!created) {
      console.log(chalk.red('Failed to create Angular project.'));
      process.exit(1);
    }

    // ── Step 13: Install libraries ──────────────────────────
    if (resolvedLibraries.length > 0) {
      await installResolvedLibraries(resolvedLibraries, projectPath);
    }

    // ── Step 14: npm install ────────────────────────────────
    console.log(chalk.bold.cyan('\n📥 Installing dependencies…\n'));
    await runNpmInstall(projectPath);

    // ── Done ────────────────────────────────────────────────
    displaySuccessMessage(config.projectName);

  } catch (err) {
    if (err.name === 'ExitPromptError') {
      console.log(chalk.yellow('\nExited.\n'));
      process.exit(0);
    }
    console.error(chalk.red('\n❌ Error:'), err.message);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Extracted Helpers — keep runCli() readable
// ═══════════════════════════════════════════════════════════════════════

function displayBanner() {
  const title = `Angular Project Initialization Automation CLI v${packageJson.version}`;
  const width = 60;
  const pad = width - title.length;
  const line = '═'.repeat(width);

  console.log(chalk.cyan.bold(`
╔${line}╗
║${' '.repeat(Math.floor(pad / 2))}${title}${' '.repeat(Math.ceil(pad / 2))}║
╚${line}╝
`));
}

async function handleProfileSelection() {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    console.log(chalk.yellow('No saved profiles found. Continuing with manual setup…\n'));
    return {};
  }

  const selected = await select({
    message: 'Select a profile:',
    choices: profiles.map(p => ({ name: p, value: p })),
  });

  const profile = await loadProfile(selected);
  displayProfileInfo(selected, profile);

  return (await confirm({ message: 'Use this profile?', default: true }))
    ? profile
    : {};
}

async function promptProjectOptions() {
  const routing = await confirm({ message: 'Enable routing?', default: true });
  const style = await select({
    message: 'Select stylesheet format:',
    choices: ['css', 'scss', 'sass', 'less'].map(s => ({ name: s, value: s })),
  });
  const strict = await confirm({ message: 'Enable strict mode?', default: true });
  const standalone = await confirm({ message: 'Use standalone components?', default: false });

  return { routing, style, strict, standalone };
}

// ── Node Incompatibility ────────────────────────────────────────────

async function handleNodeIncompatibility(nodeRequirement) {
  console.log(chalk.yellow('⚠️  Node.js version incompatibility detected!\n'));

  if (await isNvmInstalled()) {
    return handleNvmSwitch(nodeRequirement);
  }

  console.log(chalk.yellow('⚠️  nvm is not installed on your system\n'));

  const method = await select({
    message: 'How would you like to proceed?',
    choices: [
      { name: 'Install nvm (Recommended)', value: 'nvm' },
      { name: 'Install Node.js directly (Windows only)', value: 'direct' },
      { name: 'Exit and install manually', value: 'exit' },
    ],
  });

  if (method === 'nvm') {
    displayNvmInstallGuide();
    console.log(chalk.yellow('\nPlease install nvm and run this CLI again.\n'));
    process.exit(0);
  }

  if (method === 'direct') {
    if (process.platform !== 'win32') {
      console.log(chalk.red('Direct installation is only supported on Windows.'));
      process.exit(1);
    }
    if (!await installNodeWithWinget('LTS')) {
      console.log(chalk.red('Failed to install Node.js. Please install manually.'));
      process.exit(1);
    }
    console.log(chalk.yellow('\nPlease restart your terminal and run this CLI again.\n'));
    process.exit(0);
  }

  console.log(chalk.yellow('Exiting. Please install a compatible Node.js version manually.\n'));
  process.exit(0);
}

async function handleNvmSwitch(nodeRequirement) {
  console.log(chalk.cyan('✓ nvm detected on your system\n'));

  const installed = await getInstalledNodeVersions();
  const compatible = findCompatibleVersions(installed, nodeRequirement);

  if (compatible.length > 0) {
    console.log(chalk.green(`Found ${compatible.length} compatible Node version(s) installed:\n`));

    const version = await select({
      message: 'Select Node version to switch to:',
      choices: compatible.map(v => ({ name: `v${v}`, value: v })),
    });

    console.log(chalk.cyan(`\nSwitching to Node.js v${version}…\n`));

    if (!await switchNodeVersion(version)) {
      console.log(chalk.red('Failed to switch Node version. Please try manually.'));
      process.exit(1);
    }

    console.log(chalk.green('✓ Node version switched successfully\n'));
    return;
  }

  console.log(chalk.yellow('No compatible Node versions installed.\n'));
  const recommended = getRecommendedNodeVersion(nodeRequirement);

  if (!await confirm({ message: `Install Node.js v${recommended}?`, default: true })) {
    console.log(chalk.red('Cannot proceed without compatible Node.js version.'));
    process.exit(1);
  }

  if (!await installNodeVersion(recommended)) {
    console.log(chalk.red('Failed to install Node version.'));
    process.exit(1);
  }

  console.log(chalk.green('✓ Node.js installed successfully\n'));
  await switchNodeVersion(recommended);
}

// ── Library Installation ────────────────────────────────────────────

async function installResolvedLibraries(resolvedLibraries, projectPath) {
  // Show adjusted versions
  const adjusted = resolvedLibraries.filter(lib => lib.adjusted);
  if (adjusted.length > 0) {
    console.log(chalk.green('\n✓ Dynamically resolved compatible library versions:\n'));
    printObjectList(
      'Resolved Library Versions',
      adjusted.map(({ name, originalVersion, version, reason }) => ({
        Package: name, From: originalVersion, To: version, Reason: reason || '',
      })),
      ['Package', 'From', 'To', 'Reason'],
    );
  }

  // Show warnings
  const warnings = resolvedLibraries.filter(lib => lib.warning);
  if (warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Potential compatibility warnings:\n'));
    printObjectList(
      'Compatibility Warnings',
      warnings.map(({ name, version, reason }) => ({
        Package: name, Version: version, Reason: reason || '',
      })),
      ['Package', 'Version', 'Reason'],
    );
  }

  const toSpec = lib => (lib.version === 'latest' ? lib.name : `${lib.name}@${lib.version}`);

  // Production dependencies
  const prod = resolvedLibraries.filter(lib => !lib.isDev);
  if (prod.length > 0) {
    console.log(chalk.bold.cyan('\n📦 Installing production libraries…\n'));
    await installPackages(prod.map(toSpec), projectPath);
  }

  // Dev dependencies
  const dev = resolvedLibraries.filter(lib => lib.isDev);
  if (dev.length > 0) {
    console.log(chalk.bold.cyan('\n📦 Installing dev libraries…\n'));
    await installPackages(dev.map(toSpec), projectPath, true);
  }
}

// ── Success Message ─────────────────────────────────────────────────

function displaySuccessMessage(projectName) {
  const divider = chalk.gray('━'.repeat(50));

  console.log(chalk.bold.green('\n✅ Project created successfully! 🎉\n'));
  console.log(chalk.bold.cyan('📊 Next Steps:\n'));
  console.log(divider);
  console.log(chalk.white('1. ') + chalk.cyan(`cd ${projectName}`));
  console.log(chalk.white('2. ') + chalk.cyan('ng serve'));
  console.log(chalk.white('3. ') + chalk.cyan('Open http://localhost:4200 in your browser'));
  console.log(divider);

  console.log(chalk.bold.cyan('\n💡 Useful Commands:\n'));
  const cmds = [
    ['ng generate component <name>', 'Create a component'],
    ['ng generate service <name>', 'Create a service'],
    ['ng build', 'Build for production'],
    ['ng test', 'Run unit tests'],
    ['ng help', 'Get more help'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`${chalk.gray(`  ${cmd.padEnd(34)}`)}${chalk.white(desc)}`);
  }

  console.log(chalk.bold.green('\nHappy coding! 🚀\n'));
}