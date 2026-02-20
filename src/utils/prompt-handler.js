import { search, select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  searchNpmPackages,
  getEnhancedPackageInfo,
  formatDownloads,
  getPackageVersions,
  getMajorVersions,
  getMinorVersionsForMajor,
  getPatchVersionsForMinor,
} from './npm-search.js';
import {
  isVersionCompatibleWithAngular,
  getAllCompatibleVersions,
} from './compatibility.js';
import { printObjectList, printKeyValue } from './table-helper.js';

// ═══════════════════════════════════════════════════════════════════════
//  Reusable Version Picker (Major → Minor → Patch)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Interactive 3-step version selector: Major → Minor → Patch.
 *
 * Extracted to eliminate duplication — used by both Angular CLI version
 * selection (cli.js) and library version selection (this file).
 *
 * @param   {string}  label        Display label (e.g. "Angular" or "@ngrx/store")
 * @param   {object}  versionData  { versions: string[], latest?: string, lts?: string }
 * @returns {Promise<string|null>} Selected semver string, or null if none available
 */
export async function selectVersionInteractively(label, versionData) {
  const { versions, latest = null, lts = null } = versionData;

  if (versions.length === 0) {
    console.log(chalk.yellow(`No stable versions found for ${label}.`));
    return null;
  }

  // Step 1 — Major
  const majors = getMajorVersions(versions);
  const major = await select({
    message: `Select ${label} major version:`,
    choices: majors.map(m => ({
      name: latest?.startsWith(`${m}.`)
        ? `${label} ${m} (latest)`
        : `${label} ${m}`,
      value: m,
    })),
    pageSize: 15,
  });

  // Step 2 — Minor
  const minors = getMinorVersionsForMajor(versions, major);
  const minor = await select({
    message: `Select ${label} ${major} minor version:`,
    choices: minors.map(m => ({ name: `v${m}.x`, value: m })),
    pageSize: 15,
  });

  // Step 3 — Patch
  const patches = getPatchVersionsForMinor(versions, minor);
  return select({
    message: `Select ${label} ${minor} patch version:`,
    choices: patches.map(p => {
      let name = `v${p}`;
      if (p === latest) name += ' (latest)';
      if (p === lts) name += ' (LTS)';
      return { name, value: p };
    }),
    pageSize: 15,
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Library Tracker — prevents duplicate selections
// ═══════════════════════════════════════════════════════════════════════

class LibraryTracker {
  #libs = new Map();

  add(lib) { this.#libs.set(lib.name, lib); }
  remove(name) { this.#libs.delete(name); }
  has(name) { return this.#libs.has(name); }
  getAll() { return [...this.#libs.values()]; }
  get count() { return this.#libs.size; }

  display() {
    if (this.#libs.size === 0) {
      console.log(chalk.gray('  No libraries selected yet.\n'));
      return;
    }

    printObjectList(
      '📦 Currently Selected Libraries',
      this.getAll().map(lib => ({
        Library: lib.name,
        Version: lib.version,
        Description: (lib.description ?? '').substring(0, 70),
      })),
      ['Library', 'Version', 'Description'],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Display Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Format a search-result entry for inquirer's choice list. */
function formatPackageChoice(pkg) {
  const verified = pkg.verified ? ' ✓' : '';
  const desc =
    pkg.description.length > 50
      ? `${pkg.description.substring(0, 50)}…`
      : pkg.description;

  return `${pkg.name}${verified} - ${desc} (v${pkg.version})`;
}

// ═══════════════════════════════════════════════════════════════════════
//  Compatibility Resolution (extracted to flatten nesting)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify compatibility; if incompatible, offer alternatives.
 *
 * @returns {{ version: string, skip: boolean }}
 */
async function resolveCompatibleVersion(packageName, version, angularVersion) {
  console.log(chalk.cyan(`\n🔍 Checking compatibility with Angular ${angularVersion}…\n`));

  const compat = await isVersionCompatibleWithAngular(packageName, version, angularVersion);

  if (compat.compatible) {
    console.log(chalk.green(`✓ ${packageName}@${version} is compatible with Angular ${angularVersion}`));
    if (compat.peerDependency) {
      console.log(chalk.gray(`  Peer dependency: ${compat.peerDependency}\n`));
    }
    return { version, skip: false };
  }

  // ── Incompatible ────────────────────────────────────────────
  console.log(chalk.red(`✗ ${packageName}@${version} may not be compatible with Angular ${angularVersion}`));
  console.log(chalk.gray(`  ${compat.reason}\n`));

  if (!await confirm({ message: 'Would you like to see compatible versions?', default: true })) {
    return { version, skip: false };
  }

  console.log(chalk.cyan('\n🔍 Searching for compatible versions…\n'));
  const alternatives = await getAllCompatibleVersions(packageName, angularVersion, 10);

  if (alternatives.length > 0) {
    const picked = await select({
      message: 'Select a compatible version:',
      choices: [
        ...alternatives.map(cv => ({
          name: `${cv.version}${cv.peerDependency ? ` (peer: ${cv.peerDependency})` : ''}`,
          value: cv.version,
        })),
        { name: 'Keep selected version anyway', value: version },
      ],
      pageSize: 12,
    });
    return { version: picked, skip: false };
  }

  console.log(chalk.yellow('No compatible versions found automatically.'));
  const keep = await confirm({ message: 'Continue with the selected version anyway?', default: false });
  return keep ? { version, skip: false } : { version, skip: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  Next-Action Menu (shared between interactive & manual flows)
// ═══════════════════════════════════════════════════════════════════════

/**
 * @returns {'add' | 'finish'}
 */
async function askNextAction(tracker) {
  const action = await select({
    message: 'What would you like to do next?',
    choices: [
      { name: 'Add another library', value: 'add' },
      { name: 'Remove a library', value: 'remove', disabled: tracker.count === 0 },
      { name: 'Finish library selection', value: 'finish' },
    ],
    default: 'add',
  });

  if (action !== 'remove') return action;

  const toRemove = await select({
    message: 'Select library to remove:',
    choices: tracker.getAll().map(lib => ({
      name: `${lib.name}@${lib.version}`,
      value: lib.name,
    })),
  });

  tracker.remove(toRemove);
  console.log(chalk.yellow(`\n✓ Removed ${toRemove}\n`));
  return 'add'; // stay in the loop
}

// ═══════════════════════════════════════════════════════════════════════
//  Interactive Library Search (autocomplete + live compatibility)
// ═══════════════════════════════════════════════════════════════════════

export async function interactiveLibrarySearch(angularVersion = null) {
  const tracker = new LibraryTracker();

  console.log(chalk.bold.cyan('\n📦 Interactive Library Search\n'));
  if (angularVersion) {
    console.log(chalk.gray(`Angular version: ${angularVersion} (compatibility will be checked)\n`));
  }
  console.log(chalk.gray('Type to search npm packages. Press Enter to select.\n'));

  let action = 'add';

  while (action === 'add') {
    try {
      if (tracker.count > 0) tracker.display();

      // ── Search with abort-signal support ────────────────
      const packageName = await search({
        message: 'Search for a library:',
        source: async (term, { signal }) => {
          if (!term || term.length < 2) return [];

          const results = await searchNpmPackages(term, 15, { signal });
          if (signal.aborted) return [];

          const available = results.filter(pkg => !tracker.has(pkg.name));

          if (available.length === 0 && results.length > 0) {
            return [{
              name: chalk.yellow('All matching libraries have already been selected'),
              value: null,
              disabled: true,
            }];
          }

          return available.map(pkg => ({
            name: formatPackageChoice(pkg),
            value: pkg.name,
            description: pkg.description,
          }));
        },
        pageSize: 10,
      });

      if (!packageName) {
        if (!await confirm({ message: 'Continue searching?', default: false })) break;
        continue;
      }

      // ── Fetch info + versions in parallel ───────────────
      const [info, versionData] = await Promise.all([
        getEnhancedPackageInfo(packageName),
        getPackageVersions(packageName),       // prefetched → instant "specific" selection
      ]);

      if (!info) {
        console.log(chalk.yellow(`Could not fetch info for ${packageName}. Skipping.\n`));
        continue;
      }

      printKeyValue('\nSelected Package', [
        ['Name', chalk.green(info.name)],
        ['Description', chalk.gray(info.description)],
        ['Latest version', chalk.cyan(info.latestVersion)],
        ['Weekly downloads', chalk.gray(formatDownloads(info.weeklyDownloads))],
      ]);

      // ── Version selection ───────────────────────────────
      const versionMethod = await select({
        message: 'How would you like to select the version?',
        choices: [
          { name: `Use latest (${info.latestVersion})`, value: 'latest' },
          { name: 'Choose specific version (major.minor.patch)', value: 'specific' },
          { name: 'Enter version manually', value: 'manual' },
        ],
        default: 'latest',
      });

      let version = info.latestVersion;

      if (versionMethod === 'specific') {
        if (versionData.versions.length === 0) {
          console.log(chalk.yellow('Could not fetch versions. Using latest.'));
        } else {
          const picked = await selectVersionInteractively(info.name, versionData);
          if (picked) version = picked;
        }
      } else if (versionMethod === 'manual') {
        version = await input({
          message: 'Enter version:',
          default: info.latestVersion,
          validate: v => (v ? true : 'Version is required'),
        });
      }

      // ── Compatibility check ─────────────────────────────
      if (angularVersion && version !== 'latest') {
        const result = await resolveCompatibleVersion(info.name, version, angularVersion);
        if (result.skip) {
          console.log(chalk.yellow('Skipping this library.\n'));
          action = await askNextAction(tracker);
          continue;
        }
        version = result.version;
      }

      // ── Commit selection ────────────────────────────────
      tracker.add({ name: info.name, version, description: info.description });
      console.log(chalk.green(`✓ Added ${info.name}@${version} to installation queue\n`));

      action = await askNextAction(tracker);
    } catch (error) {
      if (error.name === 'ExitPromptError') break;
      console.error(chalk.red('Error during library search:'), error.message);
      action = 'finish';
    }
  }

  return tracker.getAll();
}

// ═══════════════════════════════════════════════════════════════════════
//  Simple (Manual) Library Input
// ═══════════════════════════════════════════════════════════════════════

export async function simpleLibraryInput(angularVersion = null) {
  const tracker = new LibraryTracker();

  console.log(chalk.bold.cyan('\n📦 Add Libraries\n'));
  if (angularVersion) {
    console.log(chalk.gray(`Angular version: ${angularVersion} (compatibility will be checked)\n`));
  }

  let action = 'add';

  while (action === 'add') {
    if (tracker.count > 0) tracker.display();

    const library = await input({
      message: 'Enter library name (or press Enter to skip):',
      validate: val => {
        if (!val) return true;
        if (!/^[@a-z0-9-~][a-z0-9-._~]*$/.test(val)) return 'Invalid package name format';
        if (tracker.has(val)) return `${val} has already been selected`;
        return true;
      },
    });

    if (!library) break;

    const version = await input({
      message: `Enter version for ${library} (or 'latest'):`,
      default: 'latest',
    });

    // Compatibility check
    if (angularVersion && version !== 'latest') {
      const compat = await isVersionCompatibleWithAngular(library, version, angularVersion);

      if (compat.compatible) {
        console.log(chalk.green(`✓ ${library}@${version} is compatible with Angular ${angularVersion}`));
        if (compat.peerDependency) {
          console.log(chalk.gray(`  Peer dependency: ${compat.peerDependency}\n`));
        }
      } else {
        console.log(chalk.red(`✗ ${library}@${version} may not be compatible with Angular ${angularVersion}`));
        console.log(chalk.gray(`  ${compat.reason}\n`));
        console.log(chalk.yellow('⚠️  This may cause installation issues.\n'));
      }
    }

    tracker.add({ name: library, version });
    console.log(chalk.green(`✓ Added ${library}@${version}\n`));

    action = await askNextAction(tracker);
  }

  return tracker.getAll();
}

// ═══════════════════════════════════════════════════════════════════════
//  Search Preference Prompt
// ═══════════════════════════════════════════════════════════════════════

export function askLibrarySearchPreference() {
  return select({
    message: 'How would you like to add libraries?',
    choices: [
      { name: 'Interactive search with autocomplete (Recommended)', value: 'interactive' },
      { name: 'Manual entry', value: 'manual' },
      { name: 'Skip for now', value: 'skip' },
    ],
    default: 'interactive',
  });
}